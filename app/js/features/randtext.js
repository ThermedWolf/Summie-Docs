// ==================== =rand() DUMMY TEKST ====================
// Net als in Word: typ =rand() op een lege regel en druk op Enter of Tab
// om Lorem Ipsum-achtige dummy tekst in te voegen.
//
// Ondersteunde varianten:
//   =rand()          → 3 paragrafen, elk 5 zinnen
//   =rand(p)         → p paragrafen, elk 5 zinnen
//   =rand(p,s)       → p paragrafen, elk s zinnen

(function () {
    const SENTENCES = [
        'De snelle bruine vos springt over de luie hond.',
        'Voer tekst in om te zien hoe het er in dit lettertype uitziet.',
        'Dit is voorbeeldtekst om de opmaak van het document te testen.',
        'Elke paragraaf bevat een aantal zinnen om de lay-out te demonstreren.',
        'Gebruik deze tekst als tijdelijke aanduiding totdat de echte inhoud beschikbaar is.',
        'Het document ziet er professioneel uit met goed gevormde alinea\'s.',
        'De marges en regelafstand zijn ingesteld voor optimale leesbaarheid.',
        'Kopteksten en voetteksten geven het document een nette, consistente uitstraling.',
        'Tabstops en inspringing helpen bij het uitlijnen van de tekst op de pagina.',
        'Stijlen zorgen voor een uniforme opmaak in het hele document.',
        'Een goed document begint met een heldere structuur en duidelijke opbouw.',
        'De inhoud van dit document is puur bedoeld als voorbeeld en heeft geen betekenis.',
        'Met dummy tekst kun je de opmaak beoordelen zonder afgeleid te worden door de inhoud.',
        'Dit gedeelte toont hoe normale lopende tekst eruitziet in het gekozen lettertype.',
        'Varieer de hoeveelheid tekst om te zien hoe het document zich gedraagt bij meer inhoud.',
    ];

    // Returns a paragraph string of `count` sentences
    function makeParagraph(sentenceCount) {
        const result = [];
        for (let i = 0; i < sentenceCount; i++) {
            result.push(SENTENCES[i % SENTENCES.length]);
        }
        return result.join(' ');
    }

    // Parse =rand() / =rand(p) / =rand(p,s) from a text node's full text
    // Returns { paragraphs, sentences } or null
    function parseRandCall(text) {
        const match = text.match(/=rand\(\s*(\d*)\s*(?:,\s*(\d+)\s*)?\)$/i);
        if (!match) return null;
        const paragraphs = match[1] ? Math.min(Math.max(parseInt(match[1]), 1), 20) : 3;
        const sentences = match[2] ? Math.min(Math.max(parseInt(match[2]), 1), 15) : 5;
        return { paragraphs, sentences };
    }

    // Find the current text up to the cursor in its containing block element
    function getCurrentLineText() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { text: '', block: null, range: null };

        const range = sel.getRangeAt(0);
        // Get the block element (p, div, li, etc.) that contains the cursor
        let block = range.startContainer;
        if (block.nodeType === 3) block = block.parentElement;

        const editor = document.getElementById('editor');
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        while (block && block !== editor && !blockTags.includes(block.tagName)) {
            block = block.parentElement;
        }
        if (!block || block === editor) return { text: '', block: null, range };

        return { text: block.innerText || block.textContent || '', block, range };
    }

    // Replace the current block with generated paragraphs and set cursor after last one
    function insertRandText(block, paragraphs, sentences) {
        const page = block.closest('.a4-page');

        // Build new <p> elements
        const newParas = [];
        for (let i = 0; i < paragraphs; i++) {
            const p = document.createElement('p');
            p.textContent = makeParagraph(sentences);
            newParas.push(p);
        }

        // Replace the current block with all generated paragraphs
        const parent = block.parentNode;
        parent.insertBefore(newParas[0], block);
        for (let i = 1; i < newParas.length; i++) {
            parent.insertBefore(newParas[i], block);
        }
        parent.removeChild(block);

        // Move cursor to the end of the last inserted paragraph
        const lastPara = newParas[newParas.length - 1];
        const sel = window.getSelection();
        const newRange = document.createRange();
        newRange.selectNodeContents(lastPara);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Trigger save
        if (page) page.dispatchEvent(new Event('input', { bubbles: true }));
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    // Main hook: call this from handleEditorKeydown on Enter or Tab
    function checkRandTrigger(e) {
        if (e.key !== 'Enter' && e.key !== 'Tab') return false;

        const { text, block } = getCurrentLineText();
        if (!block) return false;

        const parsed = parseRandCall(text.trim());
        if (!parsed) return false;

        e.preventDefault();
        e.stopPropagation();

        // Small delay so the browser doesn't also process the Enter/Tab
        setTimeout(() => insertRandText(block, parsed.paragraphs, parsed.sentences), 0);
        return true;
    }

    window.RandText = { checkRandTrigger };
})();