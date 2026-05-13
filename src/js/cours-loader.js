// src/js/cours-loader.js
let cachedCours = null;

export async function loadCours(forceRefresh = false) {
    if (cachedCours && !forceRefresh) return cachedCours;
    
    try {
        const response = await fetch('/parcours/cours.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        cachedCours = await response.json();
        return cachedCours;
    } catch (error) {
        console.error('Erreur chargement cours.json:', error);
        return { parcours: [] };
    }
}

export async function getParcours(slug) {
    const cours = await loadCours();
    return cours.parcours.find(p => p.slug === slug);
}

export async function getChapitre(parcoursSlug, chapitreId) {
    const parcours = await getParcours(parcoursSlug);
    if (!parcours) return null;
    return parcours.chapitres.find(c => c.id === parseInt(chapitreId));
}