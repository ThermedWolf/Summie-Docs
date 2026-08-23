// ==================== APA 7 FORMATTER ====================
// Pure citation formatting: takes a neutral citation object (as produced by
// main.js 'citation-lookup') and renders a professional APA 7 reference entry
// as safe HTML. No DOM access — safe to test in isolation.
//
// Citation object shape:
//   { sourceType, source, crossrefType, title, authors[], editors[], year,
//     publishedDate:{year,month,day} | null, journal, volume, issue, pages,
//     articleNumber, publisher, doi, url, website, issn, accessedDate }

(function () {
    'use strict';

    var MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    function e(str) {
        return window.escapeHtml
            ? window.escapeHtml(str === null || str === undefined ? '' : str)
            : String(str);
    }

    function clean(str) {
        return String(str === null || str === undefined ? '' : str).trim();
    }

    function sentenceCase(str) {
        return String(str || '').split(/\s+/).map(function (w, i) {
            if (!w) return w;
            if (w.length > 1 && w === w.toUpperCase()) return w; // keep acronyms
            if (i === 0) return w[0].toUpperCase() + w.slice(1).toLowerCase();
            return w.toLowerCase();
        }).join(' ');
    }

    function enDash(str) {
        return String(str || '').replace(/(\d)\s*[-–]\s*(\d)/g, '$1–$2');
    }

    function invertName(name) {
        var idx = name.lastIndexOf(',');
        if (idx === -1) return name;
        var last = name.slice(0, idx).trim();
        var first = name.slice(idx + 1).trim();
        return first ? first + ' ' + last : last;
    }

    function joinAuthors(names) {
        if (!names || names.length === 0) return '';
        if (names.length === 1) return names[0];
        return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
    }

    function fullDate(d) {
        if (!d) return '';
        var m = parseInt(d.month, 10);
        var month = MONTHS[m] || '';
        var day = d.day ? ', ' + d.day : '';
        return month ? month + day + ', ' + d.year : d.year;
    }

    function todayFullDate() {
        var now = new Date();
        return MONTHS[now.getMonth() + 1] + ' ' + now.getDate() + ', ' + now.getFullYear();
    }

    function hostname(url) {
        try { return new URL(url).hostname.replace(/^www\./i, ''); }
        catch (err) { return url; }
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

    function sortKey(c) {
        var base = (c.authors && c.authors[0]) || c.title || c.url || '';
        return String(base).replace(/[^\w\s]/g, '').toLowerCase();
    }

    // Main entry: renders one reference-list entry as safe HTML.
    // Scholarly sources (journal article, book, chapter, ...) never carry a
    // DOI/URL in the reference — APA 7 ends database records after the page
    // range. Only plain webpages (sourceType 'url') show a retrieval line.
    function formatAPA(c) {
        var authorStr = joinAuthors(c.authors);
        var year = clean(c.year) || 'n.d.';
        var title = sentenceCase(c.title);

        // 1. Chapter (book chapter) — check before journal because a chapter's
        //    container-title lives in `journal` and must not trigger the journal rule.
        if (crossrefLow(c).indexOf('chapter') !== -1 && c.editors && c.editors.length) {
            var eds = c.editors.map(invertName).join(', ');
            var CLEAD = authorStr ? e(authorStr) + ' (' + e(year) + ').' : e(title) + '. (' + e(year) + ').';
            var outC = CLEAD;
            if (authorStr && title) outC += ' <i>' + e(title) + '</i>' + '.';
            outC += ' In ' + e(eds) + (c.editors.length > 1 ? ' (Eds.), ' : ' (Ed.), ') + '<i>' + e(clean(c.journal) || clean(c.publisher)) + '</i>';
            if (clean(c.pages)) outC += ' (pp. ' + e(enDash(c.pages)) + ')';
            outC += '.';
            if (clean(c.publisher)) outC += ' ' + e(clean(c.publisher)) + '.';
            return outC;
        }

        // 2. Journal article
        if (isJournalLike(c)) {
            var JLEAD = authorStr ? e(authorStr) + ' (' + e(year) + ').' : e(title) + '. (' + e(year) + ').';
            var outJ = JLEAD;
            if (authorStr && title) outJ += ' ' + e(title) + '.';
            outJ += ' <i>' + e(clean(c.journal)) + '</i>';
            var vol = clean(c.volume);
            var issue = clean(c.issue);
            if (vol) outJ += ', <i>' + e(vol) + '</i>';
            if (issue) outJ += '(' + e(issue) + ')';
            var pages = clean(c.pages);
            if (pages && !isArticleNumberCompound(c)) outJ += ', ' + e(enDash(pages));
            else if (clean(c.articleNumber) && clean(c.articleNumber) !== pages) outJ += ', ' + e(clean(c.articleNumber));
            outJ += '.';
            return outJ;
        }

        // 3. Book / report / monograph
        if (isBookLike(c) || clean(c.publisher)) {
            var BLEAD = authorStr ? e(authorStr) + ' (' + e(year) + ').' : e(title) + '. (' + e(year) + ').';
            var outB = BLEAD;
            if (authorStr && title) outB += ' <i>' + e(title) + '</i>' + '.';
            var pub = clean(c.publisher);
            if (pub) outB += ' ' + e(pub) + '.';
            return outB;
        }

        // 4. Webpage — the only source type that carries a link
        if (c.sourceType === 'url' && !clean(c.doi)) {
            var site = clean(c.website) || clean(c.publisher) || hostname(c.url);
            var hasFullDate = c.publishedDate && (c.publishedDate.month || c.publishedDate.day);
            var datePart = hasFullDate ? '(' + e(fullDate(c.publishedDate)) + ').' : '(' + e(year) + ').';
            var outW = authorStr ? e(authorStr) + ' ' + datePart : e(title) + '. ' + datePart;
            if (authorStr && title) outW += ' <i>' + e(title) + '</i>' + '.';
            outW += ' ' + e(site) + '.';
            var webLink = clean(c.url);
            if (webLink) {
                outW += hasFullDate
                    ? ' ' + e(webLink)
                    : ' Geraadpleegd op ' + todayFullDate() + ', van ' + e(webLink);
            }
            return outW;
        }

        // 5. Generic fallback
        var GLEAD = authorStr ? e(authorStr) + ' (' + e(year) + ').' : e(title) + '. (' + e(year) + ').';
        var outG = GLEAD;
        if (authorStr && title) outG += ' <i>' + e(title) + '</i>' + '.';
        var org = clean(c.publisher) || clean(c.website);
        if (org) outG += ' ' + e(org) + '.';
        return outG;
    }

    // If pages is actually an article number (e.g. starts with a letter), avoid
    // rendering both "pages" and "articleNumber".
    function isArticleNumberCompound(c) {
        var p = clean(c.pages);
        return /^[A-Za-z]/.test(p) && clean(c.articleNumber) === p;
    }

    // Short in-text citation, e.g. (Doe, 2020), (Doe et al., 2020).
    function inText(c) {
        var year = clean(c.year) || 'n.d.';
        if (c.authors && c.authors.length) {
            var first = c.authors[0];
            var last = first.split(',')[0];
            if (c.authors.length >= 3) return '(' + last + ' et al., ' + year + ')';
            if (c.authors.length === 2) return '(' + last + ' & ' + c.authors[1].split(',')[0] + ', ' + year + ')';
            return '(' + last + ', ' + year + ')';
        }
        var t = sentenceCase(c.title) || c.url || 'n.b.';
        if (t.length > 15) t = t.slice(0, 15).trim() + '…';
        return '(' + t + ', ' + year + ')';
    }

    window.ApaFormat = {
        formatAPA: formatAPA,
        inText: inText,
        joinAuthors: joinAuthors,
        sentenceCase: sentenceCase,
        sortKey: sortKey,
        clean: clean,
        enDash: enDash
    };
})();