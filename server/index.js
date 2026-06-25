/* Minimal Stripe backend for custom Checkout Session flow */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const { promises: fsPromises } = fs;

const app = express();
const port = Number(process.env.STRIPE_SERVER_PORT || process.env.PORT || 4242);
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : undefined;
const stripeApiVersion = process.env.STRIPE_API_VERSION;
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
const contentFilePath = path.resolve(__dirname, '../public/landing-content.json');
const uploadsDir = path.resolve(__dirname, '../public/uploads');
const stripeSecretsFilePath = path.resolve(__dirname, 'stripe-secrets.json');
const trialOrdersFilePath = path.resolve(__dirname, 'trial-orders.json');
const blogPostsFilePath = path.resolve(__dirname, 'blog-posts.json');
const blogPostsSeedFilePath = path.resolve(__dirname, '../public/blog-posts.json');
const apiPrefix = process.env.API_ROUTE_PREFIX || '/api';
const normalizedApiPrefix = apiPrefix.replace(/\/$/, '');
const trialProduct = {
  id: 'risk-free-trial',
  name: '5in1 Facial Serum 7-Day Risk-Free Trial',
  amount: 6000,
  currency: 'usd',
  quantity: 1,
  captureDelayDays: 7,
};
const trialCaptureSchedulerMs = Number(process.env.TRIAL_CAPTURE_SCHEDULER_MS || 5 * 60 * 1000);
let isCaptureSchedulerRunning = false;

const prefixRoute = (pattern) => {
  if (!pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with '/': ${pattern}`);
  }

  if (!normalizedApiPrefix) {
    return pattern;
  }

  return `${normalizedApiPrefix}${pattern}`;
};

const ensureUploadsDir = async () => {
  try {
    await fsPromises.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Failed to ensure uploads directory:', error);
  }
};

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    const baseName = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-');
    const safeName = baseName || 'upload';
    cb(null, `${safeName}-${timestamp}-${randomSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024),
  },
});
const stripeClients = new Map();

const getTrialMetadata = () => ({
  trial: 'true',
  productId: trialProduct.id,
  captureDelayDays: String(trialProduct.captureDelayDays),
});

const buildReturnUrl = (req) => {
  const configuredBase = process.env.CHECKOUT_RETURN_URL_BASE || process.env.CHECKOUT_RETURN_URL;
  const originHeader = req.get('origin');
  const requestHost = req.get('host');
  const fallbackBase = originHeader || (requestHost ? `${req.protocol}://${requestHost}` : 'http://localhost:3000');
  const baseUrl = (configuredBase || fallbackBase || 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}/order-completed?session_id={CHECKOUT_SESSION_ID}`;
};

app.use(cors({ origin: allowedOrigins, credentials: true }));

app.post(prefixRoute('/stripe-webhook'), express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' });
  }

  let stripeClient;

  try {
    ({ stripe: stripeClient } = await getStripeClient());
  } catch (error) {
    console.error('Failed to resolve Stripe client for webhook:', error);
    return res.status(500).json({ error: 'Unable to connect to Stripe.' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe secret key is not configured.' });
  }

  const signature = req.get('stripe-signature');
  let event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return res.status(400).json({ error: 'Invalid Stripe webhook signature.' });
  }

  try {
    await handleStripeWebhookEvent(stripeClient, event);
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handling failed:', error);
    res.status(500).json({ error: 'Unable to process Stripe webhook.' });
  }
});

app.use(express.json({ limit: process.env.BODY_PARSER_LIMIT || '8mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const extractBasicCredentials = (req) => {
  const header = req.get('authorization');

  if (header && header.startsWith('Basic ')) {
    const token = header.slice('Basic '.length).trim();

    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const separatorIndex = decoded.indexOf(':');

      if (separatorIndex >= 0) {
        const email = decoded.slice(0, separatorIndex);
        const password = decoded.slice(separatorIndex + 1);
        return { email, password };
      }
    } catch (error) {
      console.warn('Failed to decode basic auth token:', error);
    }
  }

  if (req.body && typeof req.body === 'object') {
    const { email, password } = req.body;

    if (email && password) {
      return { email, password };
    }
  }

  return null;
};

const isValidAdminCredentials = (credentials) => {
  return (
    credentials
    && typeof credentials.email === 'string'
    && typeof credentials.password === 'string'
    && credentials.email === adminEmail
    && credentials.password === adminPassword
  );
};

const requireAdminAuth = (req, res) => {
  const credentials = extractBasicCredentials(req);

  if (!isValidAdminCredentials(credentials)) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
};

const stripBom = (text) => {
  if (typeof text === 'string' && text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
};

const loadContent = async () => {
  const fileBuffer = await fsPromises.readFile(contentFilePath);
  const rawText = fileBuffer.toString('utf8');
  return JSON.parse(stripBom(rawText));
};

const saveContent = async (content) => {
  const payload = `${JSON.stringify(content, null, 2)}\n`;
  await fsPromises.writeFile(contentFilePath, payload, 'utf8');
};

const createId = (prefix) => {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
};

const sanitizeSlug = (value) => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return slug || 'blog-post';
};

const getUniqueBlogSlug = (value, posts, currentId) => {
  const baseSlug = sanitizeSlug(value);
  let slug = baseSlug;
  let suffix = 2;

  while ((posts || []).some((post) => post.id !== currentId && post.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
};

const createEmptyBlogHtml = (title) => (
  `<div class="spq-template"><h1 class="spq-title">${title || 'New Blog Post'}</h1><div class="spq-block spq-copy">Start writing your post here.</div><div class="spq-block spq-center"><a class="spq-button" href="https://5in1facialserum.com/">Check Eligibility</a></div></div>`
);

const normalizeBlogPost = (post, index = 0) => {
  const now = new Date().toISOString();
  const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
  const title = typeof source.title === 'string' && source.title.trim()
    ? source.title.trim()
    : `Blog Post ${index + 1}`;
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : createId('blog');

  return {
    id,
    slug: sanitizeSlug(source.slug || title),
    title,
    metaTitle: typeof source.metaTitle === 'string' ? source.metaTitle : title,
    headerBrand: typeof source.headerBrand === 'string' ? source.headerBrand : 'Skin Care Daily',
    headerIcon: typeof source.headerIcon === 'string' ? source.headerIcon : 'S',
    html: typeof source.html === 'string' ? source.html : createEmptyBlogHtml(title),
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : now,
  };
};

const normalizeBlogStore = (store) => {
  const sourcePosts = store && typeof store === 'object' && Array.isArray(store.posts)
    ? store.posts
    : [];
  const posts = [];

  sourcePosts.forEach((post, index) => {
    const normalized = normalizeBlogPost(post, index);
    normalized.slug = getUniqueBlogSlug(normalized.slug, posts, normalized.id);
    posts.push(normalized);
  });

  return { posts };
};

const readBlogPosts = async () => {
  try {
    const buffer = await fsPromises.readFile(blogPostsFilePath);
    return normalizeBlogStore(JSON.parse(stripBom(buffer.toString('utf8'))));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      console.error('Failed to read blog posts file:', error);
      throw new Error('Unable to load blog posts.');
    }
  }

  try {
    const seedBuffer = await fsPromises.readFile(blogPostsSeedFilePath);
    return normalizeBlogStore(JSON.parse(stripBom(seedBuffer.toString('utf8'))));
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to read blog posts seed file:', error);
      throw new Error('Unable to load blog posts.');
    }

    return { posts: [] };
  }
};

const writeBlogPosts = async (store) => {
  const payload = `${JSON.stringify(normalizeBlogStore(store), null, 2)}\n`;
  await fsPromises.writeFile(blogPostsFilePath, payload, 'utf8');
};

const buildBlogPostFromPayload = (body, existingPost, posts) => {
  const now = new Date().toISOString();
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const title = typeof source.title === 'string' && source.title.trim()
    ? source.title.trim()
    : existingPost?.title || 'New Blog Post';
  const id = existingPost?.id || createId('blog');

  return {
    id,
    slug: getUniqueBlogSlug(source.slug || existingPost?.slug || title, posts, id),
    title,
    metaTitle: typeof source.metaTitle === 'string' ? source.metaTitle : existingPost?.metaTitle || title,
    headerBrand: typeof source.headerBrand === 'string' ? source.headerBrand : existingPost?.headerBrand || 'Skin Care Daily',
    headerIcon: typeof source.headerIcon === 'string' ? source.headerIcon : existingPost?.headerIcon || 'S',
    html: typeof source.html === 'string' ? source.html : existingPost?.html || createEmptyBlogHtml(title),
    createdAt: existingPost?.createdAt || now,
    updatedAt: now,
  };
};

const defaultStripeSecrets = {
  testSecretKey: '',
  liveSecretKey: '',
};

const readStripeSecrets = async () => {
  try {
    const buffer = await fsPromises.readFile(stripeSecretsFilePath);
    const parsed = JSON.parse(stripBom(buffer.toString('utf8')));

    return {
      testSecretKey: typeof parsed.testSecretKey === 'string' ? parsed.testSecretKey : '',
      liveSecretKey: typeof parsed.liveSecretKey === 'string' ? parsed.liveSecretKey : '',
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ...defaultStripeSecrets };
    }

    console.error('Failed to read Stripe secrets file:', error);
    throw new Error('Unable to load Stripe secrets.');
  }
};

const writeStripeSecrets = async (secrets) => {
  const payload = `${JSON.stringify(secrets, null, 2)}\n`;
  await fsPromises.writeFile(stripeSecretsFilePath, payload, 'utf8');
};

const readTrialOrders = async () => {
  try {
    const buffer = await fsPromises.readFile(trialOrdersFilePath);
    const parsed = JSON.parse(stripBom(buffer.toString('utf8')));
    const orders = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.orders)
        ? parsed.orders
        : [];

    return { orders };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { orders: [] };
    }

    console.error('Failed to read trial orders file:', error);
    throw new Error('Unable to load trial orders.');
  }
};

const writeTrialOrders = async (store) => {
  const payload = `${JSON.stringify({ orders: store.orders || [] }, null, 2)}\n`;
  await fsPromises.writeFile(trialOrdersFilePath, payload, 'utf8');
};

const updateTrialOrders = async (updater) => {
  const store = await readTrialOrders();
  const nextStore = await updater(store);
  await writeTrialOrders(nextStore || store);
  return nextStore || store;
};

const getPaymentIntentId = (paymentIntent) => (
  paymentIntent && typeof paymentIntent === 'object' ? paymentIntent.id : paymentIntent
);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getSessionCreatedAt = (session) => {
  if (typeof session.created === 'number') {
    return new Date(session.created * 1000);
  }

  return new Date();
};

const getTrialOrderStatusFromPaymentIntent = (paymentIntent) => {
  if (!paymentIntent || typeof paymentIntent !== 'object') {
    return 'authorized';
  }

  if (paymentIntent.status === 'succeeded') {
    return 'captured';
  }

  if (paymentIntent.status === 'canceled') {
    return 'canceled';
  }

  return 'authorized';
};

const sanitizeStripeAddress = (address) => {
  if (!address || typeof address !== 'object') {
    return null;
  }

  return {
    line1: address.line1 || '',
    line2: address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    postal_code: address.postal_code || '',
    country: address.country || '',
  };
};

const buildTrialOrderFromSession = (session) => {
  const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  const paymentIntentId = getPaymentIntentId(session.payment_intent);
  const customerDetails = session.customer_details && typeof session.customer_details === 'object'
    ? session.customer_details
    : {};
  const shippingDetails = session.shipping_details && typeof session.shipping_details === 'object'
    ? session.shipping_details
    : null;
  const createdAt = getSessionCreatedAt(session);
  const status = getTrialOrderStatusFromPaymentIntent(paymentIntent);

  return {
    id: paymentIntentId || session.id,
    sessionId: session.id,
    paymentIntentId: paymentIntentId || '',
    amount: paymentIntent && Number.isInteger(paymentIntent.amount)
      ? paymentIntent.amount
      : trialProduct.amount,
    currency: paymentIntent?.currency || session.currency || trialProduct.currency,
    status,
    customerEmail: customerDetails.email || session.customer_email || '',
    customerName: shippingDetails?.name || customerDetails.name || '',
    customerPhone: customerDetails.phone || '',
    shippingDetails: shippingDetails
      ? {
          name: shippingDetails.name || '',
          phone: shippingDetails.phone || '',
          address: sanitizeStripeAddress(shippingDetails.address),
        }
      : null,
    createdAt: createdAt.toISOString(),
    captureAt: addDays(createdAt, trialProduct.captureDelayDays).toISOString(),
    capturedAt: status === 'captured' ? new Date().toISOString() : '',
    returnedAt: '',
    canceledAt: status === 'canceled' ? new Date().toISOString() : '',
    livemode: Boolean(session.livemode),
    lastError: '',
  };
};

const isTrialSession = (session) => {
  const sessionMetadata = session && session.metadata && typeof session.metadata === 'object'
    ? session.metadata
    : {};
  const paymentIntent = session && session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  const paymentMetadata = paymentIntent && paymentIntent.metadata && typeof paymentIntent.metadata === 'object'
    ? paymentIntent.metadata
    : {};

  return sessionMetadata.trial === 'true' || paymentMetadata.trial === 'true';
};

const upsertTrialOrder = async (order) => {
  await updateTrialOrders((store) => {
    const orders = Array.isArray(store.orders) ? [...store.orders] : [];
    const index = orders.findIndex((item) =>
      item.sessionId === order.sessionId
      || (order.paymentIntentId && item.paymentIntentId === order.paymentIntentId),
    );

    if (index >= 0) {
      const existing = orders[index];
      orders[index] = {
        ...existing,
        ...order,
        status: existing.status === 'returned' ? 'returned' : order.status,
        returnedAt: existing.returnedAt || order.returnedAt || '',
        lastError: order.lastError || existing.lastError || '',
      };
    } else {
      orders.push(order);
    }

    return { orders };
  });
};

const updateTrialOrderByPaymentIntent = async (paymentIntent, updates) => {
  const paymentIntentId = getPaymentIntentId(paymentIntent);

  if (!paymentIntentId) {
    return;
  }

  await updateTrialOrders((store) => {
    const orders = (store.orders || []).map((order) => {
      if (order.paymentIntentId !== paymentIntentId) {
        return order;
      }

      const nextUpdates = typeof updates === 'function' ? updates(order) : updates;
      return {
        ...order,
        ...nextUpdates,
      };
    });

    return { orders };
  });
};

const handleStripeWebhookEvent = async (stripeClient, event) => {
  if (event.type === 'checkout.session.completed') {
    const eventSession = event.data.object;
    const session = await stripeClient.checkout.sessions.retrieve(eventSession.id, {
      expand: ['payment_intent'],
    });

    if (!isTrialSession(session)) {
      return;
    }

    await upsertTrialOrder(buildTrialOrderFromSession(session));
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    await updateTrialOrderByPaymentIntent(event.data.object, {
      status: 'captured',
      capturedAt: new Date().toISOString(),
      lastError: '',
    });
    return;
  }

  if (event.type === 'payment_intent.canceled') {
    await updateTrialOrderByPaymentIntent(event.data.object, (order) => ({
      status: order.status === 'returned' ? 'returned' : 'canceled',
      canceledAt: new Date().toISOString(),
      lastError: '',
    }));
    return;
  }

  if (event.type === 'payment_intent.payment_failed') {
    await updateTrialOrderByPaymentIntent(event.data.object, {
      status: 'failed',
      lastError: event.data.object?.last_payment_error?.message || 'Payment failed.',
    });
  }
};

const getActiveStripeSettings = async () => {
  let stripeConfig = null;

  try {
    const content = await loadContent();
    if (content && content.checkout && typeof content.checkout === 'object') {
      stripeConfig = content.checkout.stripe;
    }
  } catch (error) {
    console.error('Failed to read landing content for Stripe settings:', error);
  }

  const mode = stripeConfig && stripeConfig.mode === 'live' ? 'live' : 'test';
  const publishableKeyCandidate =
    mode === 'live'
      ? stripeConfig && typeof stripeConfig.livePublishableKey === 'string'
        ? stripeConfig.livePublishableKey.trim()
        : ''
      : stripeConfig && typeof stripeConfig.testPublishableKey === 'string'
        ? stripeConfig.testPublishableKey.trim()
        : '';

  const secrets = await readStripeSecrets();
  const secretKeyCandidate = mode === 'live' ? secrets.liveSecretKey : secrets.testSecretKey;

  return {
    mode,
    publishableKey: publishableKeyCandidate || '',
    secretKey: typeof secretKeyCandidate === 'string' ? secretKeyCandidate.trim() : '',
  };
};

const getStripeClient = async () => {
  const settings = await getActiveStripeSettings();
  const secretKey = settings.secretKey;

  if (!secretKey) {
    return { stripe: null, settings };
  }

  const cacheKey = `${secretKey}|${stripeApiVersion || 'latest'}`;

  if (stripeClients.has(cacheKey)) {
    return { stripe: stripeClients.get(cacheKey), settings };
  }

  const options = stripeApiVersion ? { apiVersion: stripeApiVersion } : {};
  const client = new Stripe(secretKey, options);
  stripeClients.clear();
  stripeClients.set(cacheKey, client);

  return { stripe: client, settings };
};

app.post(prefixRoute('/login'), (req, res) => {
  const credentials = extractBasicCredentials(req);

  if (!isValidAdminCredentials(credentials)) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  res.json({ success: true, email: credentials.email });
});

app.get(prefixRoute('/content'), async (_req, res) => {
  try {
    const content = await loadContent();
    res.json(content);
  } catch (error) {
    console.error('Failed to read landing content:', error);
    res.status(500).json({ error: 'Unable to load landing content.' });
  }
});

app.put(prefixRoute('/content'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Content payload must be an object.' });
  }

  try {
    await saveContent(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to write landing content:', error);
    res.status(500).json({ error: 'Unable to save landing content.' });
  }
});

app.post(prefixRoute('/upload-image'), (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  upload.single('file')(req, res, (error) => {
    if (error) {
      console.error('Image upload failed:', error);
      const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: error.message || 'Unable to upload image.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    const publicPath = `/uploads/${req.file.filename}`;
    res.json({ path: publicPath });
  });
});

app.get(prefixRoute('/blog-posts/:slug'), async (req, res) => {
  try {
    const store = await readBlogPosts();
    const slug = sanitizeSlug(req.params.slug);
    const post = (store.posts || []).find((item) => item.slug === slug);

    if (!post) {
      return res.status(404).json({ error: 'Blog post not found.' });
    }

    res.json({ post });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load blog post.' });
  }
});

app.get(prefixRoute('/blog-posts'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readBlogPosts();
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load blog posts.' });
  }
});

app.post(prefixRoute('/blog-posts'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readBlogPosts();
    const post = buildBlogPostFromPayload(req.body, null, store.posts || []);
    const nextStore = { posts: [post, ...(store.posts || [])] };
    await writeBlogPosts(nextStore);
    res.status(201).json({ post, posts: nextStore.posts });
  } catch (error) {
    console.error('Failed to create blog post:', error);
    res.status(500).json({ error: error.message || 'Unable to create blog post.' });
  }
});

app.put(prefixRoute('/blog-posts/:postId'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readBlogPosts();
    const postIndex = (store.posts || []).findIndex((post) => post.id === req.params.postId);

    if (postIndex < 0) {
      return res.status(404).json({ error: 'Blog post not found.' });
    }

    const updatedPost = buildBlogPostFromPayload(req.body, store.posts[postIndex], store.posts || []);
    const nextPosts = [...store.posts];
    nextPosts[postIndex] = updatedPost;
    const nextStore = { posts: nextPosts };
    await writeBlogPosts(nextStore);
    res.json({ post: updatedPost, posts: nextPosts });
  } catch (error) {
    console.error('Failed to update blog post:', error);
    res.status(500).json({ error: error.message || 'Unable to update blog post.' });
  }
});

app.post(prefixRoute('/blog-posts/:postId/duplicate'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readBlogPosts();
    const sourcePost = (store.posts || []).find((post) => post.id === req.params.postId);

    if (!sourcePost) {
      return res.status(404).json({ error: 'Blog post not found.' });
    }

    const now = new Date().toISOString();
    const duplicateTitle = `${sourcePost.title || 'Blog Post'} Copy`;
    const duplicate = {
      ...sourcePost,
      id: createId('blog'),
      slug: getUniqueBlogSlug(`${sourcePost.slug || duplicateTitle}-copy`, store.posts || []),
      title: duplicateTitle,
      metaTitle: sourcePost.metaTitle ? `${sourcePost.metaTitle} Copy` : duplicateTitle,
      createdAt: now,
      updatedAt: now,
    };
    const nextStore = { posts: [duplicate, ...(store.posts || [])] };
    await writeBlogPosts(nextStore);
    res.status(201).json({ post: duplicate, posts: nextStore.posts });
  } catch (error) {
    console.error('Failed to duplicate blog post:', error);
    res.status(500).json({ error: error.message || 'Unable to duplicate blog post.' });
  }
});

app.delete(prefixRoute('/blog-posts/:postId'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readBlogPosts();
    const nextPosts = (store.posts || []).filter((post) => post.id !== req.params.postId);

    if (nextPosts.length === (store.posts || []).length) {
      return res.status(404).json({ error: 'Blog post not found.' });
    }

    const nextStore = { posts: nextPosts };
    await writeBlogPosts(nextStore);
    res.json({ success: true, posts: nextPosts });
  } catch (error) {
    console.error('Failed to delete blog post:', error);
    res.status(500).json({ error: error.message || 'Unable to delete blog post.' });
  }
});

app.get(prefixRoute('/stripe-secrets'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const secrets = await readStripeSecrets();
    res.json(secrets);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load Stripe secrets.' });
  }
});

app.put(prefixRoute('/stripe-secrets'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const nextSecrets = {
    testSecretKey: typeof body.testSecretKey === 'string' ? body.testSecretKey.trim() : '',
    liveSecretKey: typeof body.liveSecretKey === 'string' ? body.liveSecretKey.trim() : '',
  };

  try {
    await writeStripeSecrets(nextSecrets);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to write Stripe secrets file:', error);
    res.status(500).json({ error: 'Unable to save Stripe secrets.' });
  }
});

app.get(prefixRoute('/trial-orders'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  try {
    const store = await readTrialOrders();
    const orders = [...(store.orders || [])].sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    });

    res.json({ orders, now: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load trial orders.' });
  }
});

app.post(prefixRoute('/trial-orders/:orderId/return'), async (req, res) => {
  if (!requireAdminAuth(req, res)) {
    return;
  }

  const orderId = req.params.orderId;

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  let stripeClient;

  try {
    ({ stripe: stripeClient } = await getStripeClient());
  } catch (error) {
    console.error('Failed to resolve Stripe client for trial return:', error);
    return res.status(500).json({ error: 'Unable to connect to Stripe.' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe secret key is not configured.' });
  }

  try {
    const store = await readTrialOrders();
    const order = (store.orders || []).find((item) =>
      item.id === orderId || item.paymentIntentId === orderId || item.sessionId === orderId,
    );

    if (!order) {
      return res.status(404).json({ error: 'Trial order not found.' });
    }

    if (order.status === 'captured') {
      return res.status(409).json({ error: 'This order has already been captured.' });
    }

    if (order.status === 'returned') {
      return res.json({ success: true, order });
    }

    if (!order.paymentIntentId) {
      return res.status(409).json({ error: 'This order does not have a PaymentIntent to cancel.' });
    }

    const paymentIntent = await stripeClient.paymentIntents.retrieve(order.paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      await updateTrialOrderByPaymentIntent(paymentIntent, {
        status: 'captured',
        capturedAt: new Date().toISOString(),
        lastError: '',
      });
      return res.status(409).json({ error: 'This order has already been captured.' });
    }

    if (paymentIntent.status === 'requires_capture') {
      await stripeClient.paymentIntents.cancel(order.paymentIntentId, {}, {
        idempotencyKey: `trial-return-${order.paymentIntentId}`,
      });
    }

    const returnedAt = new Date().toISOString();
    let returnedOrder = null;

    await updateTrialOrders((currentStore) => {
      const orders = (currentStore.orders || []).map((item) => {
        if (item.id !== order.id) {
          return item;
        }

        returnedOrder = {
          ...item,
          status: 'returned',
          returnedAt,
          canceledAt: returnedAt,
          lastError: '',
        };

        return returnedOrder;
      });

      return { orders };
    });

    res.json({ success: true, order: returnedOrder });
  } catch (error) {
    console.error('Failed to mark trial order as returned:', error);
    res.status(500).json({ error: error.message || 'Unable to mark order as returned.' });
  }
});

const createCheckoutSessionRoutes = ['/create-checkout-session'];
if (apiPrefix) {
  createCheckoutSessionRoutes.push(prefixRoute('/create-checkout-session'));
}

app.post(createCheckoutSessionRoutes, async (req, res) => {
  let stripeClient;
  let settings;

  try {
    const result = await getStripeClient();
    stripeClient = result.stripe;
    settings = result.settings;
  } catch (error) {
    console.error('Failed to resolve Stripe client:', error);
    return res.status(500).json({ error: 'Unable to connect to Stripe.' });
  }

  if (!stripeClient) {
    const modeLabel = settings && settings.mode === 'live' ? 'live' : 'test';
    return res.status(500).json({ error: `Add a Stripe secret key for ${modeLabel} mode in the dashboard.` });
  }

  const trialMetadata = getTrialMetadata();

  try {
    const session = await stripeClient.checkout.sessions.create({
      ui_mode: 'custom',
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: trialProduct.currency,
            product_data: {
              name: trialProduct.name,
            },
            unit_amount: trialProduct.amount,
          },
          quantity: trialProduct.quantity,
        },
      ],
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      return_url: buildReturnUrl(req),
      metadata: trialMetadata,
      payment_intent_data: {
        capture_method: 'manual',
        metadata: trialMetadata,
      },
      ...(process.env.STRIPE_ENABLE_AUTOMATIC_TAX === 'true'
        ? { automatic_tax: { enabled: true } }
        : {}),
      expand: ['payment_intent'],
    });

    res.json({ clientSecret: session.client_secret, sessionId: session.id });
  } catch (error) {
    console.error('Stripe create checkout session failed:', error);
    res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
});

const checkoutSessionPhoneRoutes = ['/checkout-session/:sessionId/phone'];
if (apiPrefix) {
  checkoutSessionPhoneRoutes.push(prefixRoute('/checkout-session/:sessionId/phone'));
}

app.post(checkoutSessionPhoneRoutes, async (req, res) => {
  let stripeClient;

  try {
    ({ stripe: stripeClient } = await getStripeClient());
  } catch (error) {
    console.error('Failed to resolve Stripe client for metadata update:', error);
    return res.status(500).json({ error: 'Unable to connect to Stripe.' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe secret key is not configured.' });
  }

  const sessionId = req.params.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid session id.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  const metadataPayload = rawPhone ? rawPhone : '';

  try {
    const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    if (!session) {
      return res.status(404).json({ error: 'Checkout session not found.' });
    }

    const nextSessionMetadata = session && session.metadata && typeof session.metadata === 'object'
      ? { ...session.metadata }
      : {};

    if (metadataPayload) {
      nextSessionMetadata.customer_phone = metadataPayload;
      nextSessionMetadata.phone_number = metadataPayload;
    } else {
      if (Object.prototype.hasOwnProperty.call(nextSessionMetadata, 'customer_phone')) {
        delete nextSessionMetadata.customer_phone;
      }
      if (Object.prototype.hasOwnProperty.call(nextSessionMetadata, 'phone_number')) {
        delete nextSessionMetadata.phone_number;
      }
    }

    await stripeClient.checkout.sessions.update(sessionId, {
      metadata: nextSessionMetadata,
    });

    const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
      ? session.payment_intent
      : null;

    if (paymentIntent && paymentIntent.id) {
      const nextPaymentIntentMetadata = paymentIntent.metadata && typeof paymentIntent.metadata === 'object'
        ? { ...paymentIntent.metadata }
        : {};

      if (metadataPayload) {
        nextPaymentIntentMetadata.customer_phone = metadataPayload;
        nextPaymentIntentMetadata.phone_number = metadataPayload;
      } else {
        if (Object.prototype.hasOwnProperty.call(nextPaymentIntentMetadata, 'customer_phone')) {
          delete nextPaymentIntentMetadata.customer_phone;
        }
        if (Object.prototype.hasOwnProperty.call(nextPaymentIntentMetadata, 'phone_number')) {
          delete nextPaymentIntentMetadata.phone_number;
        }
      }

      await stripeClient.paymentIntents.update(paymentIntent.id, {
        metadata: nextPaymentIntentMetadata,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update checkout session metadata:', error);
    res.status(500).json({ error: error.message || 'Unable to update phone number.' });
  }
});

const sessionStatusRoutes = ['/session-status'];
if (normalizedApiPrefix) {
  sessionStatusRoutes.push(prefixRoute('/session-status'));
}

app.get(sessionStatusRoutes, async (req, res) => {
  let stripeClient;

  try {
    ({ stripe: stripeClient } = await getStripeClient());
  } catch (error) {
    console.error('Failed to resolve Stripe client for session status:', error);
    return res.status(500).json({ error: 'Unable to connect to Stripe.' });
  }

  if (!stripeClient) {
    return res.status(500).json({ error: 'Stripe secret key is not configured.' });
  }

  const sessionId = req.query.session_id;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id query parameter.' });
  }

  try {
    const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const paymentIntent = session.payment_intent;
    const paymentIntentId = getPaymentIntentId(paymentIntent);
    const trialOrders = await readTrialOrders().catch(() => ({ orders: [] }));
    const trialOrder = (trialOrders.orders || []).find((order) =>
      order.sessionId === session.id || (paymentIntentId && order.paymentIntentId === paymentIntentId),
    );

    res.json({
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      payment_intent_id: paymentIntentId || null,
      payment_intent_status: paymentIntent ? paymentIntent.status : null,
      capture_status: trialOrder ? trialOrder.status : null,
      capture_at: trialOrder ? trialOrder.captureAt : null,
    });
  } catch (error) {
    console.error('Stripe session status failed:', error);
    res.status(500).json({ error: error.message || 'Unable to retrieve session status.' });
  }
});

const markOrderForCapture = async (order) => {
  let markedOrder = null;

  await updateTrialOrders((store) => {
    const orders = (store.orders || []).map((item) => {
      if (item.id !== order.id || item.status !== 'authorized') {
        return item;
      }

      markedOrder = {
        ...item,
        status: 'capturing',
        captureAttemptedAt: new Date().toISOString(),
      };

      return markedOrder;
    });

    return { orders };
  });

  return markedOrder;
};

const captureDueTrialOrder = async (stripeClient, order) => {
  if (!order.paymentIntentId) {
    await updateTrialOrders((store) => ({
      orders: (store.orders || []).map((item) =>
        item.id === order.id
          ? { ...item, status: 'failed', lastError: 'Missing PaymentIntent ID.' }
          : item,
      ),
    }));
    return;
  }

  const markedOrder = await markOrderForCapture(order);

  if (!markedOrder) {
    return;
  }

  try {
    const paymentIntent = await stripeClient.paymentIntents.retrieve(markedOrder.paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      await updateTrialOrderByPaymentIntent(paymentIntent, {
        status: 'captured',
        capturedAt: new Date().toISOString(),
        lastError: '',
      });
      return;
    }

    if (paymentIntent.status === 'canceled') {
      await updateTrialOrderByPaymentIntent(paymentIntent, {
        status: 'canceled',
        canceledAt: new Date().toISOString(),
        lastError: '',
      });
      return;
    }

    if (paymentIntent.status !== 'requires_capture') {
      await updateTrialOrderByPaymentIntent(paymentIntent, {
        status: 'failed',
        lastError: `PaymentIntent is ${paymentIntent.status}, not requires_capture.`,
      });
      return;
    }

    await stripeClient.paymentIntents.capture(markedOrder.paymentIntentId, {}, {
      idempotencyKey: `trial-capture-${markedOrder.paymentIntentId}`,
    });

    await updateTrialOrderByPaymentIntent(paymentIntent, {
      status: 'captured',
      capturedAt: new Date().toISOString(),
      lastError: '',
    });
  } catch (error) {
    console.error(`Failed to capture trial order ${markedOrder.id}:`, error);
    await updateTrialOrders((store) => ({
      orders: (store.orders || []).map((item) =>
        item.id === markedOrder.id
          ? {
              ...item,
              status: 'failed',
              lastError: error.message || 'Unable to capture PaymentIntent.',
            }
          : item,
      ),
    }));
  }
};

const runCaptureScheduler = async () => {
  if (isCaptureSchedulerRunning) {
    return;
  }

  isCaptureSchedulerRunning = true;

  try {
    const { stripe } = await getStripeClient();

    if (!stripe) {
      return;
    }

    const store = await readTrialOrders();
    const now = Date.now();
    const dueOrders = (store.orders || []).filter((order) =>
      order.status === 'authorized'
      && order.captureAt
      && (Date.parse(order.captureAt) || 0) <= now,
    );

    for (const order of dueOrders) {
      await captureDueTrialOrder(stripe, order);
    }
  } catch (error) {
    console.error('Trial capture scheduler failed:', error);
  } finally {
    isCaptureSchedulerRunning = false;
  }
};

if (trialCaptureSchedulerMs > 0) {
  setInterval(runCaptureScheduler, trialCaptureSchedulerMs);
  setTimeout(runCaptureScheduler, 10 * 1000);
}

app.listen(port, () => {
  console.log(`Stripe checkout server running on port ${port}`);
});
