#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const srcDir = path.join(ROOT, 'documentation');
const outDir = path.join(ROOT, 'out');

fs.mkdirSync(outDir, { recursive: true });

execSync([
  'asciidoctor',
  '-r asciidoctor-tabs',
  '--doctype book',
  '--backend html5',
  '--safe-mode unsafe',
  '-a idprefix=""',
  '-a idseparator="-"',
  '-a sectanchors',
  '-a toc=left',
  '-a toclevels=3',
  '-a numbered',
  '-a icons=font',
  '-a experimental',
  '-a source-highlighter=highlight.js',
  '-a highlightjs-theme=github',
  '-a docinfo=shared-head',
  `-a docinfodir=${path.join(srcDir, 'docinfo')}`,
  `-o ${path.join(outDir, 'index.html')}`,
  path.join(srcDir, 'index.asciidoc'),
].join(' '), { stdio: 'inherit' });

console.log(`Documentation generated at ${path.join(outDir, 'index.html')}`);
