import { useEffect, useState } from 'react';
import { updateFavicon } from '../components/landing/utils';

let activeTrackingNodes = [];
let activeTrackingSignature = '';
let trackingConsumerCount = 0;

const detachTrackingNodes = () => {
  if (!activeTrackingNodes.length) {
    return;
  }

  activeTrackingNodes.forEach((node) => {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  });

  activeTrackingNodes = [];
};

const normalizeScripts = (raw) => {
  return typeof raw === 'string' ? raw.trim() : '';
};

const createScriptNode = (sourceNode) => {
  const script = document.createElement('script');

  Array.from(sourceNode.attributes || []).forEach((attr) => {
    if (attr.name === 'src') {
      script.src = attr.value;
      return;
    }

    if (attr.name === 'async' || attr.name === 'defer') {
      const value = attr.value;
      if (value === '' || value.toLowerCase() === 'true') {
        script[attr.name] = true;
      }
      return;
    }

    script.setAttribute(attr.name, attr.value);
  });

  if (!sourceNode.getAttribute('src')) {
    script.textContent = sourceNode.textContent || '';
  }

  return script;
};

const applyTrackingScripts = (rawScripts) => {
  if (typeof document === 'undefined') {
    activeTrackingSignature = normalizeScripts(rawScripts);
    return;
  }

  const nextSignature = normalizeScripts(rawScripts);

  if (activeTrackingSignature === nextSignature) {
    return;
  }

  detachTrackingNodes();
  activeTrackingSignature = nextSignature;

  if (!nextSignature) {
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = nextSignature;

  const head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
  const body = document.body || document.getElementsByTagName('body')[0] || head;
  const appendedNodes = [];

  Array.from(template.content.childNodes || []).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent && node.textContent.trim()) {
        const textNode = document.createTextNode(node.textContent);
        (head || body).appendChild(textNode);
        appendedNodes.push(textNode);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const elementName = node.nodeName.toUpperCase();

    if (elementName === 'SCRIPT') {
      const script = createScriptNode(node);
      (head || body).appendChild(script);
      appendedNodes.push(script);
      return;
    }

    const clone = node.cloneNode(true);
    const target = elementName === 'NOSCRIPT' || elementName === 'IFRAME' || elementName === 'IMG'
      || elementName === 'DIV' || elementName === 'SPAN'
      ? body
      : head;

    target.appendChild(clone);
    appendedNodes.push(clone);
  });

  activeTrackingNodes = appendedNodes;
};

const PRIMARY_ENDPOINT = process.env.REACT_APP_CONTENT_ENDPOINT || '/api/content';
const FALLBACK_ENDPOINT = '/landing-content.json';

const fetchContent = async (url) => {
  const response = await fetch(url, { cache: 'no-cache' });

  if (!response.ok) {
    const error = new Error(`Failed to load landing content: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

export function useLandingContent() {
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        let payload;

        try {
          payload = await fetchContent(PRIMARY_ENDPOINT);
        } catch (primaryError) {
          if (PRIMARY_ENDPOINT !== FALLBACK_ENDPOINT) {
            try {
              payload = await fetchContent(FALLBACK_ENDPOINT);
            } catch (fallbackError) {
              throw fallbackError;
            }
          } else {
            throw primaryError;
          }
        }

        if (isMounted) {
          setContent(payload ?? null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error loading landing content'));
          setContent(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadContent();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    updateFavicon(content?.branding?.favicon?.src || '');
  }, [content]);

  useEffect(() => {
    trackingConsumerCount += 1;

    return () => {
      trackingConsumerCount = Math.max(0, trackingConsumerCount - 1);

      if (trackingConsumerCount === 0) {
        applyTrackingScripts('');
      }
    };
  }, []);

  useEffect(() => {
    if (trackingConsumerCount === 0) {
      return;
    }

    applyTrackingScripts(content?.trackingScripts || '');
  }, [content?.trackingScripts]);

  return { content, isLoading, error };
}

export default useLandingContent;
