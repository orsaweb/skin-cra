import { useEffect, useMemo, useState } from 'react';
import './Blog5in1SerumPage.css';

const BLOG_POST_ENDPOINT = '/api/blog-posts';
const BLOG_FALLBACK_ENDPOINT = '/blog-posts.json';
const DEFAULT_HOME_URL = 'https://5in1facialserum.com/';
const DEFAULT_BRAND = 'Skin Care Daily';
const DEFAULT_ICON = 'S';

const sanitizeSlug = (value) => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'skincaredaily';
};

const getSlugFromLocation = () => {
  if (typeof window === 'undefined') {
    return 'skincaredaily';
  }

  const match = window.location.pathname.match(/^\/blog\/([^/?#]+)/);
  return match ? sanitizeSlug(decodeURIComponent(match[1])) : 'skincaredaily';
};

const fetchFallbackPost = async (slug) => {
  const response = await fetch(BLOG_FALLBACK_ENDPOINT, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`Unable to load fallback blog posts (${response.status})`);
  }

  const payload = await response.json();
  const posts = Array.isArray(payload?.posts) ? payload.posts : [];
  const post = posts.find((item) => sanitizeSlug(item?.slug) === slug);

  if (!post) {
    throw new Error('Blog post not found.');
  }

  return post;
};

const fetchBlogPost = async (slug) => {
  const response = await fetch(`${BLOG_POST_ENDPOINT}/${encodeURIComponent(slug)}`, {
    cache: 'no-cache',
  });

  if (response.ok) {
    const payload = await response.json();
    if (payload?.post) {
      return payload.post;
    }
  }

  return fetchFallbackPost(slug);
};

function Blog5in1SerumPage({ slug }) {
  const resolvedSlug = useMemo(() => sanitizeSlug(slug || getSlugFromLocation()), [slug]);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState({ state: 'loading', message: '' });

  useEffect(() => {
    let isActive = true;

    setStatus({ state: 'loading', message: '' });
    setPost(null);

    fetchBlogPost(resolvedSlug)
      .then((nextPost) => {
        if (!isActive) {
          return;
        }

        setPost(nextPost);
        setStatus({ state: 'success', message: '' });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Unable to load blog post.',
        });
      });

    return () => {
      isActive = false;
    };
  }, [resolvedSlug]);

  useEffect(() => {
    if (!post) {
      return undefined;
    }

    const previousTitle = document.title;
    document.title = post.metaTitle || post.title || 'Skin Care Daily';

    return () => {
      document.title = previousTitle;
    };
  }, [post]);

  const headerBrand = post?.headerBrand || DEFAULT_BRAND;
  const headerIcon = post?.headerIcon || DEFAULT_ICON;

  return (
    <div className="blog-presale-page">
      <a className="spq-skip" href="#main-content">
        Skip to main content
      </a>

      <div className="spq-header">
        <a className="spq-logo" href={DEFAULT_HOME_URL} aria-label={`${headerBrand} home`}>
          <span className="spq-logo__icon">{headerIcon}</span>
          <span className="spq-logo__text">{headerBrand}</span>
        </a>
      </div>

      <main id="main-content">
        {status.state === 'loading' ? (
          <p className="spq-status" role="status">Loading blog post...</p>
        ) : null}

        {status.state === 'error' ? (
          <section className="spq-status spq-status--error" role="alert">
            <h1>Blog post not found</h1>
            <p>{status.message}</p>
          </section>
        ) : null}

        {post ? (
          <article className="spq-article" dangerouslySetInnerHTML={{ __html: post.html || '' }} />
        ) : null}
      </main>
    </div>
  );
}

export default Blog5in1SerumPage;
