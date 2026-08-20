const sanitizeHtml = require("sanitize-html");
const validator = require("validator");

const htmlOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img",
    "h1",
    "h2",
    "span",
    "strong",
    "em",
    "p",
    "br",
    "div",
    "ul",
    "li",
    "ol",
  ]),
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "cid"],
};

const stripHeaderControlChars = (value = "") =>
  String(value).replace(/[\r\n\x00-\x1F\x7F]+/g, " ").trim();

const sanitizePlainText = (value = "", maxLength = 500) =>
  validator.escape(stripHeaderControlChars(value)).slice(0, maxLength).trim();

const sanitizeEmailSubject = (subject = "") =>
  stripHeaderControlChars(subject).slice(0, 200).trim();

const sanitizeEmailHtml = (html = "") => sanitizeHtml(String(html), htmlOptions);

const sanitizeRecipient = (recipient) => {
  const email = stripHeaderControlChars(recipient?.email || "").toLowerCase();
  if (!validator.isEmail(email)) return null;

  const sanitized = { ...recipient, email };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string" && key !== "body") {
      sanitized[key] = sanitizePlainText(value, 1000);
    }
  }
  if (typeof sanitized.body === "string") {
    sanitized.body = sanitizeEmailHtml(sanitized.body);
  }
  if (typeof sanitized.subject === "string") {
    sanitized.subject = sanitizeEmailSubject(sanitized.subject);
  }
  return sanitized;
};

const sanitizeFooter = (footer = {}) => ({
  name: sanitizePlainText(footer.name || "", 100),
  company: sanitizePlainText(footer.company || "", 100),
  designation: sanitizePlainText(footer.designation || "", 100),
  contact: sanitizePlainText(footer.contact || "", 200),
  disclaimer: Boolean(footer.disclaimer),
});

module.exports = {
  htmlOptions,
  sanitizeEmailHtml,
  sanitizeEmailSubject,
  sanitizeFooter,
  sanitizePlainText,
  sanitizeRecipient,
  stripHeaderControlChars,
};
