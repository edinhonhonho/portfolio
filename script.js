const cards = document.querySelectorAll('.card');
const sections = document.querySelectorAll('.category');
const groups = document.querySelectorAll('.subgroup');
const searchInput = document.getElementById('searchbox');
const noResults = document.getElementById('noresults');

function liveSearch() {
    const query = searchInput.value.trim().toLowerCase();
    let total = 0;

    cards.forEach(card => {
        const match = card.textContent.toLowerCase().includes(query);
        card.hidden = !match;
        if (match) total++;
    });

    groups.forEach(group => {
        group.hidden = query !== '' && !group.querySelector('.card:not([hidden])');
    });

    sections.forEach(section => {
        const hasCards = section.querySelector('.card') !== null;
        const noMatch = hasCards ? !section.querySelector('.card:not([hidden])') : true;
        section.hidden = query !== '' && noMatch;
    });

    noResults.hidden = total > 0;
}

let typingTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(liveSearch, 250);
});
