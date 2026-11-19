// The one place the gryCE version lives. Bump it with every release.
// Every page loads this file and shows it in the footer.
const GRYCE_VERSION = '0.4.8';
document.querySelectorAll('.version').forEach((n) => { n.textContent = `gryCE v${GRYCE_VERSION}`; });
