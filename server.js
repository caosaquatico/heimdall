const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 80;
const dataFile = path.join(__dirname, 'links.json');

app.use(express.static('public'));
app.use(bodyParser.json());

// Ler links
app.get('/api/links', (req, res) => {
  if(!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]');
  const data = fs.readFileSync(dataFile);
  res.json(JSON.parse(data));
});

// Salvar/atualizar links
app.post('/api/links', (req, res) => {
  const links = req.body;
  fs.writeFileSync(dataFile, JSON.stringify(links, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
