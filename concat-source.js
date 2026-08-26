import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, 'combined_source_code.txt');

// Files and directories to include in concatenation
const INCLUDE_PATHS = [
  'index.html',
  'manifest.json',
  'version.json',
  'package.json',
  'README.md',
  'sw.js',
  'triarch.svg',
  '.github/workflows/deploy.yml',
  'assets',
  'src',
  'test'
];

/**
 * Recursively scans directory and collects all file paths
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function runConcatenation() {
  let fileList = [];

  INCLUDE_PATHS.forEach((relPath) => {
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) return;

    if (fs.statSync(fullPath).isDirectory()) {
      fileList = getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  });

  // Filter out binaries, git, node_modules, and output bundle files
  fileList = fileList.filter((f) => {
    const rel = path.relative(__dirname, f);
    const isBinary = f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.ico') || f.endsWith('.zip');
    return (
      !isBinary &&
      !rel.startsWith('node_modules') &&
      !rel.startsWith('.git') &&
      !rel.startsWith('scratch') &&
      !rel.endsWith('combined_source_code.txt') &&
      !rel.endsWith('concat-source.js')
    );
  });

  // Sort files deterministically
  fileList.sort();

  let outputContent = `================================================================================\n`;
  outputContent += ` TRIARCH: CYCLIC EDGE - COMBINED SOURCE CODE BUNDLE\n`;
  outputContent += ` Generated on: ${new Date().toISOString()}\n`;
  outputContent += ` Total Source Files: ${fileList.length}\n`;
  outputContent += `================================================================================\n\n`;

  fileList.forEach((filePath) => {
    const relativePath = path.relative(__dirname, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    outputContent += `\n`;
    outputContent += `/* =============================================================================\n`;
    outputContent += ` * FILE: ${relativePath}\n`;
    outputContent += ` * ============================================================================= */\n\n`;
    outputContent += content;
    outputContent += `\n\n`;
  });

  fs.writeFileSync(OUTPUT_FILE, outputContent, 'utf-8');
  console.log(`Successfully concatenated ${fileList.length} source files into:`);
  console.log(` -> ${OUTPUT_FILE}`);
}

runConcatenation();
