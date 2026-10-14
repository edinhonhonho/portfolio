let cards = document.querySelectorAll('.card');
let sections = document.querySelectorAll('.category');
let groups = document.querySelectorAll('.subgroup');

function liveSearch() {
    let search_query = document.getElementById("searchbox").value.toLowerCase();

    cards.forEach(card => {
        let match = card.innerText.toLowerCase().includes(search_query);
        card.style.display = match ? "flex" : "none";
    });

    // Hide sub-groups and sections with no visible cards
    groups.forEach(group => {
        let visible = [...group.querySelectorAll('.card')].some(c => c.style.display !== "none");
        group.style.display = visible ? "" : "none";
    });

    sections.forEach(section => {
        let hasCards = section.querySelector('.card') !== null;
        let visible = hasCards
            ? [...section.querySelectorAll('.card')].some(c => c.style.display !== "none")
            : search_query === "";
        section.style.display = visible ? "" : "none";
    });
}

//A little delay
let typingTimer;
let typeInterval = 500;
let searchInput = document.getElementById('searchbox');

searchInput.addEventListener('keyup', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(liveSearch, typeInterval);
});
