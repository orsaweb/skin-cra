import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../pages/Blog5in1SerumPage.css';

const BLOG_POSTS_ENDPOINT = '/api/blog-posts';
const UPLOAD_ENDPOINT = process.env.REACT_APP_UPLOAD_ENDPOINT || '/api/upload-image';
const HOME_URL = 'https://5in1facialserum.com/';

const sanitizeSlug = (value) => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'blog-post';
};

const createEmptyHtml = (title) => (
  `<div class="spq-template"><h1 class="spq-title">${title || 'New Blog Post'}</h1><div class="spq-block spq-copy">Start writing your post here.</div><div class="spq-block spq-center"><a class="spq-button" href="${HOME_URL}">Check Eligibility</a></div></div>`
);

const createDraftFromPost = (post) => ({
  id: post?.id || '',
  title: post?.title || 'New Blog Post',
  slug: sanitizeSlug(post?.slug || post?.title || 'blog-post'),
  metaTitle: post?.metaTitle || post?.title || 'New Blog Post',
  headerBrand: post?.headerBrand || 'Skin Care Daily',
  headerIcon: post?.headerIcon || 'S',
  html: post?.html || createEmptyHtml(post?.title || 'New Blog Post'),
});

const getBlogUrl = (slug) => `/blog/${sanitizeSlug(slug)}`;

const getEditableItems = (html) => {
  if (typeof document === 'undefined') {
    return { buttons: [], images: [] };
  }

  const template = document.createElement('template');
  template.innerHTML = html || '';

  return {
    buttons: Array.from(template.content.querySelectorAll('a.spq-button')).map((button, index) => {
      const labelClone = button.cloneNode(true);
      labelClone.querySelectorAll('.spq-pulse').forEach((node) => node.remove());

      return {
        index,
        text: (labelClone.textContent || '').replace(/\s+/g, ' ').trim(),
        href: button.getAttribute('href') || '',
        hasPulse: Boolean(button.querySelector('.spq-pulse')),
      };
    }),
    images: Array.from(template.content.querySelectorAll('img')).map((image, index) => ({
      index,
      src: image.getAttribute('src') || '',
      alt: image.getAttribute('alt') || '',
    })),
  };
};

const updateTemplateHtml = (html, updater) => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html || '';
  updater(template);
  return template.innerHTML;
};

function BlogPostsManager({ authHeader, onUnauthorized }) {
  const htmlTextareaRef = useRef(null);
  const previewArticleRef = useRef(null);
  const selectedPostIdRef = useRef('');
  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

  const selectedPost = useMemo(() => (
    posts.find((post) => post.id === selectedPostId) || null
  ), [posts, selectedPostId]);

  const editableItems = useMemo(() => getEditableItems(draft?.html || ''), [draft?.html]);

  const isDirty = useMemo(() => {
    if (!draft || !selectedPost) {
      return false;
    }

    return JSON.stringify(draft) !== JSON.stringify(createDraftFromPost(selectedPost));
  }, [draft, selectedPost]);

  useEffect(() => {
    selectedPostIdRef.current = selectedPostId;
  }, [selectedPostId]);

  const applyPosts = useCallback((nextPosts, preferredId) => {
    const normalizedPosts = Array.isArray(nextPosts) ? nextPosts : [];
    const nextSelected = normalizedPosts.find((post) => post.id === preferredId)
      || normalizedPosts[0]
      || null;

    setPosts(normalizedPosts);
    setSelectedPostId(nextSelected?.id || '');
    setDraft(nextSelected ? createDraftFromPost(nextSelected) : null);
  }, []);

  const loadBlogPosts = useCallback(async (preferredPostId) => {
    if (!authHeader) {
      return;
    }

    setIsLoading(true);
    setStatus({ state: 'idle', message: '' });

    try {
      const response = await fetch(BLOG_POSTS_ENDPOINT, {
        headers: { Authorization: authHeader },
        cache: 'no-cache',
      });

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(`Unable to load blog posts (${response.status})`);
      }

      const payload = await response.json().catch(() => ({}));
      applyPosts(payload.posts, preferredPostId || selectedPostIdRef.current);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to load blog posts.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [applyPosts, authHeader, onUnauthorized]);

  useEffect(() => {
    loadBlogPosts();
  }, [loadBlogPosts]);

  const updateDraftField = useCallback((field, value) => {
    setDraft((prev) => ({
      ...(prev || createDraftFromPost(null)),
      [field]: field === 'slug' ? sanitizeSlug(value) : value,
    }));
    setStatus({ state: 'idle', message: '' });
  }, []);

  const selectPost = useCallback((postId) => {
    if (postId === selectedPostId) {
      return;
    }

    if (isDirty && !window.confirm('Discard unsaved blog changes?')) {
      return;
    }

    const nextPost = posts.find((post) => post.id === postId);
    setSelectedPostId(nextPost?.id || '');
    setDraft(nextPost ? createDraftFromPost(nextPost) : null);
    setStatus({ state: 'idle', message: '' });
  }, [isDirty, posts, selectedPostId]);

  const createPost = useCallback(async () => {
    if (!authHeader) {
      return;
    }

    const title = `New Blog Post ${posts.length + 1}`;
    setIsSaving(true);
    setStatus({ state: 'saving', message: 'Creating blog post...' });

    try {
      const response = await fetch(BLOG_POSTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          title,
          slug: sanitizeSlug(title),
          metaTitle: title,
          headerBrand: 'Skin Care Daily',
          headerIcon: 'S',
          html: createEmptyHtml(title),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(payload.error || `Unable to create blog post (${response.status})`);
      }

      applyPosts(payload.posts, payload.post?.id);
      setStatus({ state: 'success', message: 'Blog post created.' });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to create blog post.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [applyPosts, authHeader, onUnauthorized, posts.length]);

  const duplicatePost = useCallback(async () => {
    if (!authHeader || !selectedPostId) {
      return;
    }

    setIsSaving(true);
    setStatus({ state: 'saving', message: 'Duplicating blog post...' });

    try {
      const response = await fetch(`${BLOG_POSTS_ENDPOINT}/${encodeURIComponent(selectedPostId)}/duplicate`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(payload.error || `Unable to duplicate blog post (${response.status})`);
      }

      applyPosts(payload.posts, payload.post?.id);
      setStatus({ state: 'success', message: 'Blog post duplicated.' });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to duplicate blog post.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [applyPosts, authHeader, onUnauthorized, selectedPostId]);

  const savePost = useCallback(async () => {
    if (!authHeader || !draft?.id) {
      return;
    }

    const latestPreviewHtml = previewArticleRef.current?.innerHTML;
    const payloadDraft = typeof latestPreviewHtml === 'string' && latestPreviewHtml !== draft.html
      ? { ...draft, html: latestPreviewHtml }
      : draft;

    setIsSaving(true);
    setStatus({ state: 'saving', message: 'Saving blog post...' });

    try {
      const response = await fetch(`${BLOG_POSTS_ENDPOINT}/${encodeURIComponent(payloadDraft.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payloadDraft),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(payload.error || `Unable to save blog post (${response.status})`);
      }

      applyPosts(payload.posts, payload.post?.id);
      setStatus({ state: 'success', message: 'Blog post saved.' });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to save blog post.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [applyPosts, authHeader, draft, onUnauthorized]);

  const deletePost = useCallback(async () => {
    if (!authHeader || !selectedPostId || !selectedPost) {
      return;
    }

    if (!window.confirm(`Delete "${selectedPost.title}"?`)) {
      return;
    }

    setIsSaving(true);
    setStatus({ state: 'saving', message: 'Deleting blog post...' });

    try {
      const response = await fetch(`${BLOG_POSTS_ENDPOINT}/${encodeURIComponent(selectedPostId)}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
        }

        throw new Error(payload.error || `Unable to delete blog post (${response.status})`);
      }

      applyPosts(payload.posts, '');
      setStatus({ state: 'success', message: 'Blog post deleted.' });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete blog post.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [applyPosts, authHeader, onUnauthorized, selectedPost, selectedPostId]);

  const updateHtml = useCallback((updater) => {
    setDraft((prev) => ({
      ...(prev || createDraftFromPost(null)),
      html: updateTemplateHtml(prev?.html || '', updater),
    }));
    setStatus({ state: 'idle', message: '' });
  }, []);

  const updateButton = useCallback((index, field, value) => {
    updateHtml((template) => {
      const buttons = Array.from(template.content.querySelectorAll('a.spq-button'));
      const button = buttons[index];

      if (!button) {
        return;
      }

      if (field === 'href') {
        button.setAttribute('href', value);
        return;
      }

      const hadPulse = Boolean(button.querySelector('.spq-pulse'));
      button.textContent = value;

      if (hadPulse) {
        button.appendChild(document.createTextNode(' '));
        const pulse = document.createElement('span');
        pulse.className = 'spq-pulse';
        pulse.innerHTML = '&rsaquo;';
        button.appendChild(pulse);
      }
    });
  }, [updateHtml]);

  const updateImage = useCallback((index, field, value) => {
    updateHtml((template) => {
      const images = Array.from(template.content.querySelectorAll('img'));
      const image = images[index];

      if (image) {
        image.setAttribute(field, value);
      }
    });
  }, [updateHtml]);

  const uploadImageFile = useCallback(async (file) => {
    if (!file || !authHeader) {
      return '';
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
      }

      throw new Error(payload.error || `Image upload failed (${response.status})`);
    }

    return payload.path || '';
  }, [authHeader, onUnauthorized]);

  const insertHtmlAtCursor = useCallback((snippet) => {
    setDraft((prev) => {
      const current = prev?.html || '';
      const textarea = htmlTextareaRef.current;

      if (!textarea) {
        return {
          ...(prev || createDraftFromPost(null)),
          html: `${current}\n${snippet}`,
        };
      }

      const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : current.length;
      const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
      const nextHtml = `${current.slice(0, start)}${snippet}${current.slice(end)}`;

      window.setTimeout(() => {
        textarea.focus();
        const nextPosition = start + snippet.length;
        textarea.setSelectionRange(nextPosition, nextPosition);
      }, 0);

      return {
        ...(prev || createDraftFromPost(null)),
        html: nextHtml,
      };
    });
    setStatus({ state: 'idle', message: '' });
  }, []);

  const uploadAndInsertImage = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || !authHeader) {
      return;
    }

    setIsUploadingImage(true);
    setStatus({ state: 'saving', message: 'Uploading image...' });

    try {
      const uploadedPath = await uploadImageFile(file);
      if (uploadedPath) {
        insertHtmlAtCursor(`<div class="spq-block spq-copy"><div class="blog-image-row"><img src="${uploadedPath}" alt=""></div></div>`);
        setStatus({ state: 'success', message: 'Image uploaded and inserted into HTML.' });
      }
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Image upload failed.',
      });
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  }, [authHeader, insertHtmlAtCursor, uploadImageFile]);

  const uploadAndReplaceImage = useCallback(async (event, index) => {
    const file = event.target.files && event.target.files[0];
    if (!file || !authHeader) {
      return;
    }

    setUploadingImageIndex(index);
    setStatus({ state: 'saving', message: 'Replacing image...' });

    try {
      const uploadedPath = await uploadImageFile(file);

      if (uploadedPath) {
        updateImage(index, 'src', uploadedPath);
        setStatus({ state: 'success', message: 'Image replaced.' });
      }
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Image upload failed.',
      });
    } finally {
      setUploadingImageIndex(null);
      event.target.value = '';
    }
  }, [authHeader, updateImage, uploadImageFile]);

  const insertButton = useCallback(() => {
    insertHtmlAtCursor(`<div class="spq-block spq-center"><a class="spq-button" href="${HOME_URL}">Check Eligibility</a></div>`);
  }, [insertHtmlAtCursor]);

  const syncPreviewHtml = useCallback(() => {
    const nextHtml = previewArticleRef.current?.innerHTML;

    if (typeof nextHtml !== 'string') {
      return;
    }

    setDraft((prev) => {
      if (!prev || prev.html === nextHtml) {
        return prev;
      }

      return {
        ...prev,
        html: nextHtml,
      };
    });
    setStatus({ state: 'idle', message: '' });
  }, []);

  const preventPreviewNavigation = useCallback((event) => {
    if (event.target instanceof Element && event.target.closest('a')) {
      event.preventDefault();
    }
  }, []);

  return (
    <section className="dashboard__blog-manager">
      <div className="dashboard__blog-header">
        <div>
          <h2>Blog Posts</h2>
          <p>Create, duplicate, and edit presale blog posts by slug.</p>
        </div>
        <div className="dashboard__blog-actions">
          <button type="button" onClick={() => loadBlogPosts()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh blogs'}
          </button>
          <button type="button" onClick={createPost} disabled={isSaving}>
            New post
          </button>
          <button type="button" onClick={duplicatePost} disabled={!selectedPostId || isSaving}>
            Duplicate
          </button>
        </div>
      </div>

      {status.message ? (
        <p
          className={`dashboard__blog-status dashboard__blog-status--${status.state}`}
          role={status.state === 'error' ? 'alert' : 'status'}
        >
          {status.message}
        </p>
      ) : null}

      <div className="dashboard__blog-layout">
        <aside className="dashboard__blog-list" aria-label="Blog posts">
          {posts.length ? posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={post.id === selectedPostId ? 'dashboard__blog-list-item is-selected' : 'dashboard__blog-list-item'}
              onClick={() => selectPost(post.id)}
            >
              <strong>{post.title || 'Untitled post'}</strong>
              <span>{getBlogUrl(post.slug)}</span>
            </button>
          )) : (
            <p>{isLoading ? 'Loading blog posts...' : 'No blog posts yet.'}</p>
          )}
        </aside>

        {draft ? (
          <div className="dashboard__blog-editor">
            <div className="dashboard__blog-editor-bar">
              <span>{isDirty ? 'Unsaved blog changes' : 'Blog saved'}</span>
              <div>
                <a href={getBlogUrl(draft.slug)} target="_blank" rel="noreferrer">
                  Preview URL
                </a>
                <button type="button" onClick={savePost} disabled={!isDirty || isSaving}>
                  {isSaving ? 'Saving...' : 'Save blog post'}
                </button>
                <button type="button" className="dashboard__blog-danger" onClick={deletePost} disabled={isSaving}>
                  Delete
                </button>
              </div>
            </div>

            <div className="dashboard__blog-grid">
              <label>
                Title
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) => updateDraftField('title', event.target.value)}
                />
              </label>
              <label>
                Slug
                <input
                  type="text"
                  value={draft.slug}
                  onChange={(event) => updateDraftField('slug', event.target.value)}
                />
              </label>
              <label>
                Meta title
                <input
                  type="text"
                  value={draft.metaTitle}
                  onChange={(event) => updateDraftField('metaTitle', event.target.value)}
                />
              </label>
              <label>
                Header brand
                <input
                  type="text"
                  value={draft.headerBrand}
                  onChange={(event) => updateDraftField('headerBrand', event.target.value)}
                />
              </label>
              <label>
                Header icon
                <input
                  type="text"
                  value={draft.headerIcon}
                  maxLength={3}
                  onChange={(event) => updateDraftField('headerIcon', event.target.value)}
                />
              </label>
              <label>
                Public URL
                <input type="text" value={getBlogUrl(draft.slug)} readOnly />
              </label>
            </div>

            <div className="dashboard__blog-tools">
              <button type="button" onClick={insertButton}>Insert CTA button</button>
              <label className={isUploadingImage ? 'dashboard__blog-upload is-disabled' : 'dashboard__blog-upload'}>
                {isUploadingImage ? 'Uploading image...' : 'Upload image and insert'}
                <input type="file" accept="image/*" onChange={uploadAndInsertImage} disabled={isUploadingImage} />
              </label>
            </div>

            <div className="dashboard__blog-detected">
              <details open>
                <summary>Detected Buttons</summary>
                {editableItems.buttons.length ? editableItems.buttons.map((button) => (
                  <div key={`button-${button.index}`} className="dashboard__blog-detected-row">
                    <label>
                      Text
                      <input
                        type="text"
                        value={button.text}
                        onChange={(event) => updateButton(button.index, 'text', event.target.value)}
                      />
                    </label>
                    <label>
                      Link
                      <input
                        type="text"
                        value={button.href}
                        onChange={(event) => updateButton(button.index, 'href', event.target.value)}
                      />
                    </label>
                  </div>
                )) : <p>No `.spq-button` links detected.</p>}
              </details>

              <details>
                <summary>Detected Images</summary>
                {editableItems.images.length ? editableItems.images.map((image) => (
                  <div key={`image-${image.index}`} className="dashboard__blog-image-row">
                    <div className="dashboard__blog-image-preview">
                      {image.src ? <img src={image.src} alt={image.alt || `Blog visual ${image.index + 1}`} /> : null}
                    </div>
                    <div className="dashboard__blog-image-fields">
                      <label>
                        Source
                        <input
                          type="text"
                          value={image.src}
                          onChange={(event) => updateImage(image.index, 'src', event.target.value)}
                        />
                      </label>
                      <label>
                        Alt text
                        <input
                          type="text"
                          value={image.alt}
                          onChange={(event) => updateImage(image.index, 'alt', event.target.value)}
                        />
                      </label>
                    </div>
                    <label
                      className={
                        uploadingImageIndex === image.index
                          ? 'dashboard__blog-upload dashboard__blog-image-upload is-disabled'
                          : 'dashboard__blog-upload dashboard__blog-image-upload'
                      }
                    >
                      {uploadingImageIndex === image.index ? 'Uploading...' : 'Replace image'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => uploadAndReplaceImage(event, image.index)}
                        disabled={uploadingImageIndex === image.index}
                      />
                    </label>
                  </div>
                )) : <p>No images detected.</p>}
              </details>
            </div>

            <label className="dashboard__blog-html">
              HTML content
              <textarea
                ref={htmlTextareaRef}
                rows={22}
                value={draft.html}
                onChange={(event) => updateDraftField('html', event.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="dashboard__blog-preview">
              <h3>Live Preview</h3>
              <div className="blog-presale-page dashboard__blog-preview-frame">
                <article
                  ref={previewArticleRef}
                  className="spq-article dashboard__blog-editable-preview"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={syncPreviewHtml}
                  onClick={preventPreviewNavigation}
                  dangerouslySetInnerHTML={{ __html: draft.html }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default BlogPostsManager;
