#!/usr/bin/env node
/**
 * Renders one .docx per activity from a JSON description of the team's
 * fixed Groovy-action documentation template ("EDS"). Matches, block for
 * block, the hand-built reference doc the team approved (fonts, spacing,
 * heading levels, and how SQL/code is presented) — the only intentional
 * deviation from that reference is the table header fill color (#EA3323
 * instead of the reference's blue).
 *
 * Usage:
 *   node generate-docx.js <input.json> <outputDir>
 *
 * Input JSON shape:
 * {
 *   "activities": [
 *     {
 *       "fileName": "01-motor-promo-afilia-invitado-fc-valida.docx",
 *       "blocks": [
 *         { "type": "title",   "text": "Flow name" },
 *         { "type": "meta",    "text": "flowId 123 — flowCode X" },
 *         { "type": "note",    "text": "Disclaimer / no-data note (italic gray)" },
 *         { "type": "spacer" },
 *         { "type": "heading1", "text": "Actividad 1" },
 *         { "type": "heading2", "text": "Mapeo de Datos" },
 *         { "type": "heading3", "text": "1. valida()" },
 *         { "type": "bold",    "text": "API / BD: ..." },
 *         { "type": "paragraph", "text": "Normal prose." },
 *         { "type": "table",   "headers": ["Origen", "Destino"], "rows": [["Request", "campo"]] },
 *         { "type": "code",    "text": "SELECT *\nFROM ...\nWHERE ID = ?" }
 *       ]
 *     }
 *   ]
 * }
 *
 * Block types:
 *   title      — document title (bold, 20pt)
 *   meta       — plain metadata line (flowId/actionId/version)
 *   note       — italic gray disclaimer or "no data" note
 *   spacer     — blank paragraph (vertical gap)
 *   heading1/2/3 — section headings (built-in Word heading levels/colors)
 *   bold       — single bold inline-label line (e.g. "API / BD: ...")
 *   paragraph  — normal body prose
 *   table      — bordered table, header row filled #EA3323
 *   code       — literal multi-line SQL/Groovy, one line per row, in a
 *                shaded (#F2F2F2), bordered, Consolas 9pt single-cell table
 *                so line breaks always render (never a bare "\n" in a run)
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require('docx');

const HEADER_FILL = 'EA3323';
const CODE_FILL = 'F2F2F2';
const NOTE_COLOR = '555555';

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: '999999' };
const CELL_BORDERS = {
  top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER,
};
const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text) {
  return new TableCell({
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEADER_FILL },
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), bold: true })],
    })],
  });
}

function bodyCell(text) {
  return new TableCell({
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '') })] })],
  });
}

function buildTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(headerCell) }),
      ...rows.map((r) => new TableRow({ children: r.map(bodyCell) })),
    ],
  });
}

// Code/SQL: one paragraph per literal line inside a single shaded cell, so
// line breaks always render (a bare "\n" inside a run's text is not a line
// break in Word — only separate paragraphs or <w:br/> are).
function buildCodeTable(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: CELL_BORDERS,
            margins: CELL_MARGINS,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: CODE_FILL },
            children: lines.map((line) => new Paragraph({
              spacing: { after: 0 },
              children: [new TextRun({ text: line, font: 'Consolas', size: 18 })],
            })),
          }),
        ],
      }),
    ],
  });
}

function buildBlock(block) {
  switch (block.type) {
    case 'title':
      return new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 100 },
        children: [new TextRun({ text: block.text, bold: true, size: 40 })],
      });
    case 'meta':
      return new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: block.text })],
      });
    case 'note':
      return new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: block.text, italics: true, color: NOTE_COLOR })],
      });
    case 'spacer':
      return new Paragraph({ spacing: { after: 100 }, children: [] });
    case 'heading1':
      return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 150, before: 300 }, text: block.text });
    case 'heading2':
      return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 120, before: 260 }, text: block.text });
    case 'heading3':
      return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { after: 100, before: 220 }, text: block.text });
    case 'bold':
      return new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: block.text, bold: true })],
      });
    case 'paragraph':
      return new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: block.text })],
      });
    case 'table':
      return buildTable(block.headers, block.rows);
    case 'code':
      return buildCodeTable(block.text);
    default:
      throw new Error(`Unknown block type: ${block.type}`);
  }
}

async function main() {
  const [, , inputPath, outputDir] = process.argv;
  if (!inputPath || !outputDir) {
    console.error('Usage: node generate-docx.js <input.json> <outputDir>');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  fs.mkdirSync(outputDir, { recursive: true });

  for (const activity of input.activities) {
    const children = activity.blocks.map(buildBlock);
    const doc = new Document({
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      sections: [{ children }],
    });
    const buffer = await Packer.toBuffer(doc);
    const outPath = path.join(outputDir, activity.fileName);
    fs.writeFileSync(outPath, buffer);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
