// ==================== LANGUAGE DETECTION ====================
// Tiny stopword-based nl/en detector for per-block language switching.
// Unique stopwords weigh double; shared words (is, in, en) count for both.
// Returns 'nl', 'en', or null (too short / mixed → caller falls back).

(function () {
    'use strict';

    const NL = new Set((
        'de het een van voor met dat die dit deze aan door over onder tussen ' +
        'maar want omdat als dan toen hij zij wij jullie hun onze jouw uw ' +
        'zijn heeft hebben had hadden wordt worden werd werden kan kunnen ' +
        'moet moeten mag mogen zal zullen wil willen niet geen wel ook nog ' +
        'hier daar waar hoe wat wie waarom welke wanneer zeer veel meer ' +
        'meest minder dag week maand jaar vandaag gisteren morgen mensen ' +
        'huis school werk tijd geld land stad straat water iets niets alles ' +
        'beide elke ieder alle zo dus toch even net kind man vrouw jongen ' +
        'meisje vader moeder broer zus vriend hoofdstuk paragraaf alinea ' +
        'samenvatting begrippen woord woorden zin zinnen taal talen'
    ).split(' '));

    const EN = new Set((
        'the a an of to and on at for with from by about that this these ' +
        'those then than there their they them he she it we you your our ' +
        'his her are was were been have has had do does did will would can ' +
        'could shall should may might must not no yes but or if because so ' +
        'very more most less other such only same many much day week month ' +
        'year today yesterday tomorrow people house school work time money ' +
        'country city street water something nothing everything both each ' +
        'every all any some now here how what who why which when hi hello ' +
        'summary summaries glossary term terms chapter paragraph word words ' +
        'sentence language languages'
    ).split(' '));

    function detect(text) {
        if (!text) return null;
        const words = String(text).toLowerCase().match(/[a-zà-öø-ÿ]+/g) || [];
        let nlUniq = 0, enUniq = 0, shared = 0;
        let n = 0;
        for (const w of words) {
            if (w.length < 2) continue;
            const inNl = NL.has(w);
            const inEn = EN.has(w);
            if (inNl && inEn) shared++;
            else if (inNl) nlUniq++;
            else if (inEn) enUniq++;
            if (++n >= 80) break;
        }
        if (nlUniq + enUniq < 1) return null; // no decisive evidence
        const nlScore = nlUniq * 2 + shared;
        const enScore = enUniq * 2 + shared;
        const total = nlScore + enScore;
        if (total <= 0) return null;
        const ratio = nlScore / total;
        if (ratio >= 0.6) return 'nl';
        if (ratio <= 0.4) return 'en';
        return null; // mixed or tied
    }

    window.LangDetect = { detect };
})();
