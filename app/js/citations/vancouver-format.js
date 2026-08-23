// ==================== VANCOUVER FORMATTER ====================
// Vancouver (numbered) citation formatting: takes a neutral citation object
// and renders a professional Vancouver reference entry as safe HTML.
// No DOM access — safe to test in isolation.
//
// Citation object shape (same as APA):
//   { sourceType, source, crossrefType, title, authors[], editors[], year,
//     publishedDate:{year,month,day} | null, journal, volume, issue, pages,
//     articleNumber, publisher, doi, url, website, issn, accessedDate }

(function () {
    'use strict';

    var MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function e(str) {
        return window.escapeHtml
            ? window.escapeHtml(str === null || str === undefined ? '' : str)
            : String(str);
    }

    function clean(str) {
        return String(str === null || str === undefined ? '' : str).trim();
    }

    function joinAuthors(names, maxAuthors) {
        if (!names || names.length === 0) return '';
        var limit = maxAuthors || 6;
        
        // Crossref returns authors as [surname, initials, surname, initials, ...]
        // Pair them up: "Lima-Martínez M.M., Carrera Boada C., ..."
        var paired = [];
        for (var i = 0; i < names.length; i += 2) {
            var surname = clean(names[i]);
            var initials = clean(names[i + 1] || '');
            if (surname) {
                // Remove periods from initials: "M. M." -> "MM"
                initials = initials.replace(/\.\s*/g, '');
                paired.push(surname + ' ' + initials);
            }
        }
        
        var toUse = paired.slice(0, limit);
        var result = toUse.join(', ');
        if (paired.length > limit) result += ' et al.';
        return result;
    }

    function formatDate(d) {
        if (!d) return '';
        var m = parseInt(d.month, 10);
        var month = MONTHS[m] || '';
        var day = d.day ? ' ' + d.day : '';
        return month ? month + day + ' ' + d.year : d.year;
    }

    function hostname(url) {
        try { return new URL(url).hostname.replace(/^www\./i, ''); }
        catch (err) { return url; }
    }

    // ── In-text citation notation (document-wide setting) ───────────────
    // Vancouver offers three in-text notations: [1], (1) or superscript ¹.
    // One is chosen per document and applied to every in-text citation.
    var VALID_IN_TEXT_STYLES = ['brackets', 'parentheses', 'superscript'];
    var _inTextStyle = 'brackets'; // classic Vancouver default

    function getInTextStyle() {
        return _inTextStyle;
    }

    function setInTextStyle(style) {
        if (VALID_IN_TEXT_STYLES.indexOf(style) === -1) return false;
        _inTextStyle = style;
        return true;
    }

    function crossrefLow(c) {
        return (c.crossrefType || '').toLowerCase();
    }

    function isJournalLike(c) {
        var t = crossrefLow(c);
        return t === 'journal-article' || t === 'journal-issue' || clean(c.journal);
    }

    function isBookLike(c) {
        var t = crossrefLow(c);
        return ['book', 'monograph', 'edited-book', 'reference-book', 'report', 'standard'].indexOf(t) !== -1;
    }

    // Main entry: renders one reference-list entry as safe HTML.
    // The `index` parameter is the citation number (1-based) in the reference list.
    // Scholarly sources (journal article, book, chapter, ...) never carry a
    // DOI/URL — no "Available from:" for them. Per NLM, that phrase is only
    // used for webpages / online-only sources without a DOI.
    function formatVancouver(c, index) {
        var authorStr = joinAuthors(c.authors);
        var year = clean(c.year) || '';
        var title = clean(c.title);

        var out = '';

        // Number prefix
        out += '<span class="vancouver-number">' + e(index) + '. </span>';

        // 1. Journal article
        if (isJournalLike(c)) {
            if (authorStr) out += e(authorStr) + '. ';
            if (title) out += e(title) + '. ';
            out += '<i>' + e(clean(c.journal)) + '</i>';
            if (year) out += '. ' + e(year) + ';';
            var vol = clean(c.volume);
            var issue = clean(c.issue);
            if (vol) out += e(vol);
            if (issue) out += '(' + e(issue) + ')';
            var pages = clean(c.pages);
            if (pages) out += ':' + e(pages);
            return out;
        }

        // 2. Book / report / monograph
        if (isBookLike(c) || clean(c.publisher)) {
            if (authorStr) out += e(authorStr) + '. ';
            if (title) out += '<i>' + e(title) + '</i>. ';
            var ed = clean(c.edition);
            if (ed && ed !== '1') out += e(ed) + ' ed. ';
            var pub = clean(c.publisher);
            if (pub) out += e(pub) + '; ';
            if (year) out += e(year) + '.';
            return out;
        }

        // 3. Book chapter (in edited book)
        if (crossrefLow(c).indexOf('chapter') !== -1 && c.editors && c.editors.length) {
            if (authorStr) out += e(authorStr) + '. ';
            if (title) out += e(title) + '. In: ';
            var eds = joinAuthors(c.editors);
            out += e(eds) + ', editors. ';
            out += '<i>' + e(clean(c.journal) || clean(c.publisher)) + '</i>. ';
            var pub = clean(c.publisher);
            if (pub) out += e(pub) + '; ';
            if (year) out += e(year) + '.';
            var pages = clean(c.pages);
            if (pages) out += ' p. ' + e(pages) + '.';
            return out;
        }

        // 4. Webpage / online source — the only source type with "Available from:"
        if (c.sourceType === 'url' && !clean(c.doi)) {
            if (authorStr) out += e(authorStr) + '. ';
            if (title) out += e(title) + ' [Internet]. ';
            var site = clean(c.website) || clean(c.publisher) || hostname(c.url);
            if (site) out += e(site) + '; ';
            var pubDate = c.publishedDate;
            var dateStr = pubDate ? formatDate(pubDate) : year;
            // NLM format: [cited YYYY Mon DD]
            var citedDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            var citedParts = citedDate.split('-');
            var citedFormatted = citedParts[0] + ' ' + MONTHS[parseInt(citedParts[1], 10)] + ' ' + citedParts[2];
            out += '[cited ' + e(citedFormatted) + ']';
            var webLink = clean(c.url);
            if (webLink) out += '. Available from: ' + e(webLink);
            return out;
        }

        // 5. Generic fallback
        if (authorStr) out += e(authorStr) + '. ';
        if (title) out += '<i>' + e(title) + '</i>. ';
        var org = clean(c.publisher) || clean(c.website);
        if (org) out += e(org) + '. ';
        if (year) out += e(year) + '.';
        return out;
    }

    // Wrap a number group ("1", "1-3", "1,3") in the document's notation.
    // brackets → [1] · parentheses → (1) · superscript → <sup>1</sup>
    // Output is HTML-safe: only internally generated digits/delimiters flow in.
    function wrapNumberGroup(numbers) {
        if (_inTextStyle === 'parentheses') return '(' + numbers + ')';
        if (_inTextStyle === 'superscript') return '<sup>' + numbers + '</sup>';
        return '[' + numbers + ']';
    }

    // Short in-text citation for Vancouver: the number in the chosen notation
    // e.g., [1] / (1) / ¹
    function inText(c, index) {
        return wrapNumberGroup(String(index));
    }

    // Generate in-text citation for multiple citations at once
    // e.g., [1,3,4] or [1-3]
    function inTextMultiple(indices) {
        if (!indices || indices.length === 0) return '';
        if (indices.length === 1) return wrapNumberGroup(String(indices[0]));

        // Check if consecutive
        var consecutive = true;
        for (var i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i-1] + 1) {
                consecutive = false;
                break;
            }
        }
        if (consecutive) {
            return wrapNumberGroup(indices[0] + '-' + indices[indices.length - 1]);
        }
        return wrapNumberGroup(indices.join(','));
    }

    window.VancouverFormat = {
        formatVancouver: formatVancouver,
        inText: inText,
        inTextMultiple: inTextMultiple,
        getInTextStyle: getInTextStyle,
        setInTextStyle: setInTextStyle,
        joinAuthors: joinAuthors,
        clean: clean
    };
})();