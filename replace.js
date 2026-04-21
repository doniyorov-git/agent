const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
    /<style>([\s\S]*?)<\/style>/, 
    '<link rel="stylesheet" href="assets/css/style.css">'
);

html = html.replace(
    /<script>([\s\S]*?)<\/script>[\s\S]*?<\/body>/, 
    '<script src="assets/js/core.js"></script>\n    <script src="assets/js/audio-ai.js"></script>\n    <script src="assets/js/engine.js"></script>\n    <script src="assets/js/tracking.js"></script>\n    <script src="assets/js/main.js"></script>\n</body>'
);

fs.writeFileSync('index.html', html);
console.log('Replacement completed successfully.');
