#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'BIOIA_Portugues_500.json');
const expectedTopics = [
  'Texto escrito',
  'Estrutura das palavras',
  'Semântica',
  'Fonética e Fonologia',
  'Representação gráfica da Língua falada'
];

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt')
    .replace(/[“”"'‘’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function validar(perguntas) {
  const erros = [];
  const avisos = [];
  if (!Array.isArray(perguntas)) throw new Error('O banco deve ser uma lista JSON.');

  const ids = new Set();
  const contagens = new Map(expectedTopics.map(t => [t, 0]));
  const enunciados = new Map();

  perguntas.forEach((q, i) => {
    const ref = q && q.id ? q.id : 'índice ' + i;
    if (!q || typeof q !== 'object') {
      erros.push(ref + ': registo inválido');
      return;
    }
    if (!q.id || ids.has(q.id)) erros.push(ref + ': ID ausente ou repetido');
    ids.add(q.id);

    if (!contagens.has(q.topic)) erros.push(ref + ': tema fora dos cinco temas definidos');
    else contagens.set(q.topic, contagens.get(q.topic) + 1);

    if (!q.question || !String(q.question).trim()) erros.push(ref + ': enunciado vazio');
    if (!q.explanation || !String(q.explanation).trim()) erros.push(ref + ': explicação vazia');

    const op = q.options || {};
    for (const letra of ['A', 'B', 'C', 'D']) {
      if (!op[letra] || !String(op[letra]).trim()) erros.push(ref + ': falta opção ' + letra);
    }
    if (!['A', 'B', 'C', 'D'].includes(q.correct_answer)) erros.push(ref + ': chave de resposta inválida');

    const chave = normalizar(q.question);
    if (chave) {
      if (!enunciados.has(chave)) enunciados.set(chave, []);
      enunciados.get(chave).push(ref);
    }
  });

  for (const tema of expectedTopics) {
    const n = contagens.get(tema);
    if (n !== 100) erros.push('Tema "' + tema + '": esperado 100, encontrado ' + n);
  }

  for (const [enunciado, refs] of enunciados) {
    if (refs.length > 1) avisos.push('Enunciado repetido (' + refs.length + '): ' + refs.join(', ') + ' — ' + enunciado);
  }

  return { total: perguntas.length, temas: Object.fromEntries(contagens), idsUnicos: ids.size === perguntas.length, repeticoes: avisos.length, erros, avisos };
}

try {
  const perguntas = JSON.parse(fs.readFileSync(file, 'utf8'));
  const resultado = validar(perguntas);
  console.log(JSON.stringify(resultado, null, 2));
  if (resultado.erros.length || resultado.repeticoes) process.exitCode = 1;
} catch (erro) {
  console.error('Falha na validação: ' + erro.message);
  process.exitCode = 2;
}
