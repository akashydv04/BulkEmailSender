export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://bulkemailsender-pjpa.onrender.com/api"
    : "http://localhost:5001/api");

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx"];

export function getFileExtension(fileName = "") {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

export function validateDocumentFile(file, maxBytes = RESUME_MAX_BYTES) {
  if (!file) return "Please select a file.";
  if (!DOCUMENT_EXTENSIONS.includes(getFileExtension(file.name))) {
    return "Please upload a PDF, DOC, or DOCX file.";
  }
  if (file.size > maxBytes) {
    return "File size must be 5 MB or less.";
  }
  return null;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again in a moment.");
    }
    throw new Error("Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function sanitizePreviewHtml(html = "") {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, meta").forEach((node) =>
    node.remove(),
  );
  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}
