// src/js/cours-loader.js
let cachedCours = null;

async function loadCours(forceRefresh = false) {
    if (cachedCours && !forceRefresh) return cachedCours;
    
    const data = await staticJson.get('/parcours/cours.json');
    if (data) return data;
    console.error('Erreur chargement cours.json');
    return { parcours: [] };}

async function getParcours(slug) {
    const cours = await loadCours();
    return cours.parcours.find(p => p.slug === slug);
}

async function getChapitre(parcoursSlug, chapitreId) {
    const parcours = await getParcours(parcoursSlug);
    if (!parcours) return null;
    return parcours.chapitres.find(c => c.id === parseInt(chapitreId));
}

// Permet l'accès depuis une balise <script type="module"> normale
// qui charge ce fichier via src= mais ne peut pas faire d'import
// dans chapter_template.html à cause du préfixe GitHub Pages.
window.getChapitre = getChapitre;
window.loadCours = loadCours;
window.getParcours = getParcours;
