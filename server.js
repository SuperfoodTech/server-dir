const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 18792;
const LAPORAN_DIR = process.env.LAPORAN_DIR || '/home/akbar/weekly/agency/laporan';

// Support JSON & urlencoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Session Middleware
app.use(session({
  secret: 'laporan-viewer-secure-session-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours session validity
  }
}));

// Simple Login Endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  // Ganti 'admin123' dengan password yang Anda inginkan
  if (password === 'admin123') {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  
  return res.status(401).json({ success: false, error: 'Password salah' });
});

// Logout Endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Gagal logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Middleware to protect routes
app.use((req, res, next) => {
  // Whitelist routes needed for login page itself
  if (
    req.path === '/login.html' ||
    req.path === '/api/login' ||
    req.path === '/style.css'
  ) {
    return next();
  }

  // If user is authenticated, proceed
  if (req.session && req.session.authenticated) {
    return next();
  }

  // For API paths, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Otherwise, redirect to login page (relative path for reverse-proxy compatibility)
  res.writeHead(302, { Location: 'login.html' });
  res.end();
});

// Serve static files (Protected under the middleware above)
app.use(express.static(path.join(__dirname, 'public')));


// Helper to format file size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Securely check if a file path is within the allowed base directory
function isSafePath(targetPath) {
  const resolvedBase = path.resolve(LAPORAN_DIR);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

// Recursive function to search all .xlsx files in the directory
async function getExcelFilesRecursive(dir, baseDir) {
  let results = [];
  let files;
  
  try {
    files = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`Directory ${dir} could not be read:`, err.message);
    return [];
  }
  
  for (const file of files) {
    const resPath = path.resolve(dir, file.name);
    
    // Ignore hidden files and directories (like .git, .pm2)
    if (file.name.startsWith('.')) {
      continue;
    }
    
    if (file.isDirectory()) {
      const subResults = await getExcelFilesRecursive(resPath, baseDir);
      results = results.concat(subResults);
    } else if (file.isFile() && file.name.endsWith('.xlsx')) {
      try {
        const relativePath = path.relative(baseDir, resPath);
        const stat = await fs.stat(resPath);
        results.push({
          name: file.name,
          size: formatBytes(stat.size),
          sizeRaw: stat.size,
          modified: stat.mtime,
          relativePath: relativePath
        });
      } catch (statErr) {
        console.warn(`Could not stat file ${resPath}:`, statErr.message);
      }
    }
  }
  return results;
}

// Endpoint to list all files
app.get('/api/files', async (req, res) => {
  try {
    const filesList = await getExcelFilesRecursive(LAPORAN_DIR, LAPORAN_DIR);
    
    // Calculate stats
    const totalFiles = filesList.length;
    const grabFiles = filesList.filter(f => 
      f.relativePath.toLowerCase().includes('/grab/') || 
      f.relativePath.toLowerCase().startsWith('grab/')
    ).length;
    
    const shopeeFiles = filesList.filter(f => 
      f.relativePath.toLowerCase().includes('/shopee/') || 
      f.relativePath.toLowerCase().startsWith('shopee/')
    ).length;

    res.json({
      success: true,
      rootName: path.basename(LAPORAN_DIR),
      files: filesList,
      stats: {
        totalFiles,
        grabFiles,
        shopeeFiles
      }
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Endpoint to download a file
app.get('/api/download', async (req, res) => {
  const { file } = req.query;
  
  if (!file) {
    return res.status(400).json({ error: 'File parameter is required' });
  }

  if (!isSafePath(file)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const absolutePath = path.resolve(LAPORAN_DIR, file);

  try {
    await fs.access(absolutePath);
    res.download(absolutePath);
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Laporan Viewer running on http://0.0.0.0:${PORT}`);
  console.log(`Serving files from: ${LAPORAN_DIR}`);
});
