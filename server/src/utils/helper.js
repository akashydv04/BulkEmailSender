const validator = require('validator');
const crypto = require('crypto');
const axios = require('axios');

// Heuristic Name Extraction
function extractNameFromEmail(email) {
    try {
        const parts = email.split('@');
        if (parts.length < 1) return null;

        let localPart = parts[0];

        // Remove numbers from the end
        localPart = localPart.replace(/[0-9]+$/, '');

        // Split by dot, underscore, or hyphen
        const segments = localPart.split(/[._-]/);

        if (segments.length === 0) return null;

        // Filter out common generic prefixes if needed
        const generic = ['contact', 'info', 'support', 'admin', 'hr', 'sales', 'hello'];
        if (segments.length === 1 && generic.includes(segments[0].toLowerCase())) {
            return null;
        }

        // Capitalize
        const nameSegments = segments.map(seg => {
            return seg.charAt(0).toUpperCase() + seg.slice(1);
        });

        return nameSegments.join(' ');
    } catch (e) {
        return null;
    }
}

// Gravatar OSINT Lookup
async function fetchGravatarProfile(email) {
    try {
        const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
        const url = `https://www.gravatar.com/${hash}.json`;

        const res = await axios.get(url, { timeout: 2000 }); // Fast timeout
        if (res.data && res.data.entry && res.data.entry[0]) {
            const entry = res.data.entry[0];
            // Try display name, then name object
            if (entry.displayName) return entry.displayName;
            if (entry.name && (entry.name.givenName || entry.name.familyName)) {
                return [entry.name.givenName, entry.name.familyName].filter(Boolean).join(' ');
            }
        }
    } catch (e) {
        // 404 means no profile
        return null;
    }
    return null;
}

exports.processEmailList = async (rawInput) => {
    if (!rawInput) return { valid: [], invalid: [] };

    const items = rawInput.split(/[\n,;|]+/).map(item => item.trim()).filter(item => item);

    const uniqueEmails = new Set();
    const valid = [];
    const invalid = [];

    // Limit processing to avoid timeout on massive lists
    // For production, this should be a job, but here we cap concurrent checks
    const BATCH_SIZE = 10;

    // First pass: validate formats
    const candidates = [];

    items.forEach(item => {
        const email = item.toLowerCase();
        if (uniqueEmails.has(email)) return;

        if (validator.isEmail(email)) {
            uniqueEmails.add(email);
            candidates.push(email);
        } else {
            invalid.push(item);
        }
    });

    // Second pass: resolve names (Batch Process)
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async (email) => {
            let name = null;
            let source = 'fallback'; // heuristic, osint, fallback

            // 1. Try OSINT (Gravatar)
            // Only try if it doesn't look like a role account
            const isRole = /^(admin|support|info|contact|hr|sales)@/.test(email);
            if (!isRole) {
                const gravatarName = await fetchGravatarProfile(email);
                if (gravatarName) {
                    name = gravatarName;
                    source = 'OSINT (Gravatar)';
                }
            }

            // 2. Fallback to Heuristic
            if (!name) {
                const heuristicName = extractNameFromEmail(email);
                if (heuristicName) {
                    name = heuristicName;
                    source = 'Heuristic';
                }
            }

            return { email, name, source };
        }));

        valid.push(...results);
    }

    return { valid, invalid };
};
