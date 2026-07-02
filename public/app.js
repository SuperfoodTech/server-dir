// App State
let reportData = null;
let virtualTree = null; // Nested dynamic folder tree
let rootFolderName = 'weekly'; // Name of the active base directory
let currentPath = []; // Array of path segments, e.g. [], ['agency'], ['agency', 'laporan']
let navigationHistory = [[]];
let historyIndex = 0;

let searchQuery = '';
let currentSortColumn = 'name';
let currentSortOrder = 'asc'; // 'asc' or 'desc'
let selectedRowIndex = -1;

// DOM Elements
const filesTableBody = document.getElementById('files-table-body');
const filesTable = document.getElementById('files-table');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const addressPath = document.getElementById('address-path');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const itemsCountText = document.getElementById('items-count');

const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnUp = document.getElementById('btn-up');
const btnRefresh = document.getElementById('btn-refresh');
const btnLogout = document.getElementById('btn-logout');

const driveDetails = document.getElementById('drive-details');
const driveProgress = document.getElementById('drive-progress');
const statsGrabText = document.getElementById('stats-grab');
const statsShopeeText = document.getElementById('stats-shopee');
const sidebarDynamicRoot = document.getElementById('sidebar-dynamic-root');

// Initialize Lucide Icons
function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Format bytes helper
function formatBytes(bytes) {
  if (bytes === 0) return '0 KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i === 0) return bytes + ' Bytes';
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fetch files from backend
async function fetchReports() {
  showLoading(true);
  try {
    // Relative API call for prefix routing (/weekly/)
    const response = await fetch('api/files');
    if (!response.ok) throw new Error('Network error');
    
    const result = await response.json();
    if (result.success) {
      reportData = result;
      rootFolderName = result.rootName || 'weekly';
      
      // Parse dynamic tree from files list
      virtualTree = buildTree(result.files);
      
      // Update top-level stats
      updateStoragePanel(result.stats);
      
      // Populate sidebar tree
      populateSidebar();
      
      // Render currently active folder
      navigateTo(currentPath, false); // false = don't push history (this is initial load)
    } else {
      showError('Failed to parse remote files.');
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
    showError('Cannot reach reports server.');
  } finally {
    showLoading(false);
  }
}

// Helper to build virtual tree
function buildTree(files) {
  const root = { name: 'Root', isFolder: true, children: {} };
  
  files.forEach(file => {
    const parts = file.relativePath.split('/');
    let current = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = (i === parts.length - 1);
      
      if (isLast) {
        current.children[part] = {
          name: file.name,
          displayName: file.name,
          isFolder: false,
          dateModified: file.modified,
          size: file.size,
          sizeRaw: file.sizeRaw,
          type: 'Microsoft Excel Worksheet',
          relativePath: file.relativePath
        };
      } else {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            displayName: part.replace(/_/g, ' '),
            isFolder: true,
            children: {},
            sizeRaw: 0,
            dateModified: null
          };
        }
        current.children[part].sizeRaw += file.sizeRaw;
        
        const fileDate = new Date(file.modified);
        if (!current.children[part].dateModified || fileDate > new Date(current.children[part].dateModified)) {
          current.children[part].dateModified = file.modified;
        }
        current = current.children[part];
      }
    }
  });
  
  return root;
}

// Helper to resolve folder by path array
function getFolderByPath(tree, pathArr) {
  let current = tree;
  for (const part of pathArr) {
    if (current && current.children && current.children[part]) {
      current = current.children[part];
    } else {
      return null;
    }
  }
  return current;
}

function showLoading(isLoading) {
  if (isLoading) {
    loadingSpinner.classList.remove('hidden');
    filesTable.classList.add('hidden');
    emptyState.classList.add('hidden');
  } else {
    loadingSpinner.classList.add('hidden');
    filesTable.classList.remove('hidden');
  }
}

function showError(message) {
  filesTableBody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; padding: 3rem 0; color: var(--shopee-color);">
        <i data-lucide="alert-circle" style="width: 2.5rem; height: 2.5rem; margin-bottom: 0.5rem;"></i>
        <div style="font-weight: 600; font-size: 1rem;">Connection Error</div>
        <div style="font-size: 0.8rem; opacity: 0.8;">${message}</div>
      </td>
    </tr>
  `;
  initIcons();
}

function updateStoragePanel(stats) {
  if (statsGrabText) statsGrabText.textContent = stats.grabFiles;
  if (statsShopeeText) statsShopeeText.textContent = stats.shopeeFiles;
  if (driveDetails) driveDetails.textContent = `${stats.totalFiles} / 250 Files Used`;
  
  if (driveProgress) {
    const percentage = Math.min((stats.totalFiles / 250) * 100, 100);
    driveProgress.style.width = `${percentage}%`;
  }
}

// Build sidebar navigation dynamically
function populateSidebar() {
  if (!sidebarDynamicRoot) return;
  sidebarDynamicRoot.innerHTML = '';
  if (!virtualTree || !virtualTree.children) return;
  
  // 1. Create the root item node representing the active base directory (weekly or laporan)
  const rootLi = document.createElement('li');
  rootLi.className = 'tree-item expanded';
  
  const hasSubfolders = Object.keys(virtualTree.children).some(k => virtualTree.children[k].isFolder);
  
  rootLi.innerHTML = `
    <div class="tree-row" id="tree-root-row">
      <i data-lucide="chevron-down" class="tree-arrow" style="${hasSubfolders ? '' : 'opacity:0;pointer-events:none;'}"></i>
      <i data-lucide="folder-open" class="tree-icon"></i>
      <strong>${rootFolderName}</strong>
    </div>
    <ul class="tree-children"></ul>
  `;
  
  const rootRow = rootLi.querySelector('#tree-root-row');
  const rootArrow = rootLi.querySelector('.tree-arrow');
  const rootChildrenUl = rootLi.querySelector('.tree-children');
  
  rootRow.addEventListener('click', (e) => {
    if (hasSubfolders) {
      const isExpanded = rootLi.classList.toggle('expanded');
      if (isExpanded) {
        rootChildrenUl.classList.remove('hidden');
        rootRow.querySelector('.tree-icon').setAttribute('data-lucide', 'folder-open');
      } else {
        rootChildrenUl.classList.add('hidden');
        rootRow.querySelector('.tree-icon').setAttribute('data-lucide', 'folder');
      }
      initIcons();
    }
    navigateTo([]);
    e.stopPropagation();
  });
  
  // 2. Recursively render directory items
  function renderTreeNodes(node, parentPath, containerElement) {
    const keys = Object.keys(node.children).filter(k => node.children[k].isFolder).sort();
    
    keys.forEach(key => {
      const child = node.children[key];
      const currentFullPath = [...parentPath, child.name];
      const li = document.createElement('li');
      li.className = 'tree-item';
      
      const pathString = currentFullPath.join('/');
      li.innerHTML = `
        <div class="tree-row" data-path="${pathString}">
          <i data-lucide="chevron-right" class="tree-arrow"></i>
          <i data-lucide="folder" class="tree-icon"></i>
          <span>${child.displayName}</span>
        </div>
        <ul class="tree-children hidden"></ul>
      `;
      
      const row = li.querySelector('.tree-row');
      const arrow = li.querySelector('.tree-arrow');
      const childrenUl = li.querySelector('.tree-children');
      
      // Check if this child itself has subfolders
      const childHasSubfolders = Object.keys(child.children).some(k => child.children[k].isFolder);
      if (!childHasSubfolders) {
        arrow.style.opacity = '0';
        arrow.style.pointerEvents = 'none';
      }
      
      row.addEventListener('click', (e) => {
        if (childHasSubfolders) {
          const isExpanded = li.classList.toggle('expanded');
          if (isExpanded) {
            childrenUl.classList.remove('hidden');
            row.querySelector('.tree-icon').setAttribute('data-lucide', 'folder-open');
          } else {
            childrenUl.classList.add('hidden');
            row.querySelector('.tree-icon').setAttribute('data-lucide', 'folder');
          }
          initIcons();
        }
        navigateTo(currentFullPath);
        e.stopPropagation();
      });
      
      // Recurse
      if (childHasSubfolders) {
        renderTreeNodes(child, currentFullPath, childrenUl);
      }
      
      containerElement.appendChild(li);
    });
  }
  
  renderTreeNodes(virtualTree, [], rootChildrenUl);
  sidebarDynamicRoot.appendChild(rootLi);
  initIcons();
}

// Navigation Handler
function navigateTo(path, pushToHistory = true) {
  currentPath = [...path];
  searchQuery = ''; // Clear search on navigation
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  selectedRowIndex = -1;
  
  if (pushToHistory) {
    navigationHistory = navigationHistory.slice(0, historyIndex + 1);
    navigationHistory.push([...currentPath]);
    historyIndex = navigationHistory.length - 1;
  }
  
  updateToolbarButtons();
  updateAddressBar();
  highlightActiveSidebar();
  renderExplorerContents();
}

function updateToolbarButtons() {
  btnBack.disabled = historyIndex === 0;
  btnForward.disabled = historyIndex === navigationHistory.length - 1;
  btnUp.disabled = currentPath.length === 0;
}

function updateAddressBar() {
  let html = `
    <span onclick="navigateTo([])">This PC</span>
    <i data-lucide="chevron-right" class="path-sep"></i>
    <span onclick="navigateTo([])" class="${currentPath.length === 0 ? 'active-folder' : ''}">${rootFolderName}</span>
  `;
  
  let tempPath = [];
  for (let i = 0; i < currentPath.length; i++) {
    const part = currentPath[i];
    tempPath.push(part);
    const pathJson = JSON.stringify(tempPath);
    const displayName = part.replace(/_/g, ' ');
    const isActive = (i === currentPath.length - 1);
    
    html += `
      <i data-lucide="chevron-right" class="path-sep"></i>
      <span onclick='navigateTo(${pathJson})' class="${isActive ? 'active-folder' : ''}">${displayName}</span>
    `;
  }
  
  addressPath.innerHTML = html;
  initIcons();
}

function highlightActiveSidebar() {
  if (!sidebarDynamicRoot) return;
  document.querySelectorAll('.explorer-sidebar .tree-item').forEach(el => {
    el.classList.remove('active-tree-item');
  });
  
  if (currentPath.length === 0) {
    document.getElementById('tree-root-row').parentElement.classList.add('active-tree-item');
    return;
  }
  
  const pathString = currentPath.join('/');
  const activeRow = document.querySelector(`.tree-row[data-path="${pathString}"]`);
  if (activeRow) {
    activeRow.parentElement.classList.add('active-tree-item');
    
    // Auto expand parents
    let parent = activeRow.parentElement;
    while (parent && parent.tagName === 'LI') {
      parent.classList.add('expanded');
      const childUl = parent.querySelector('.tree-children');
      if (childUl) childUl.classList.remove('hidden');
      
      const p1 = parent.parentElement;
      parent = p1 ? p1.parentElement : null;
    }
  }
}

// Generate the items to list based on path or search query
function getExplorerItems() {
  if (!reportData || !virtualTree) return [];
  
  let items = [];
  
  if (searchQuery.trim().length > 0) {
    const query = searchQuery.toLowerCase().trim();
    reportData.files.forEach(file => {
      if (file.name.toLowerCase().includes(query)) {
        items.push({
          name: file.name,
          dateModified: file.modified,
          type: 'Microsoft Excel Worksheet',
          size: file.size,
          sizeRaw: file.sizeRaw,
          isFolder: false,
          relativePath: file.relativePath
        });
      }
    });
    return items;
  }
  
  const folder = getFolderByPath(virtualTree, currentPath);
  if (folder && folder.children) {
    Object.keys(folder.children).forEach(key => {
      const child = folder.children[key];
      items.push({
        name: child.name,
        displayName: child.displayName,
        dateModified: child.dateModified,
        type: child.isFolder ? 'File folder' : child.type,
        size: child.isFolder ? formatBytes(child.sizeRaw) : child.size,
        sizeRaw: child.sizeRaw,
        isFolder: child.isFolder,
        path: [...currentPath, child.name],
        relativePath: child.relativePath
      });
    });
  }
  
  return items;
}

// Sorting logic
function sortItems(items) {
  return items.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    
    let valA, valB;
    
    if (currentSortColumn === 'name') {
      valA = (a.displayName || a.name).toLowerCase();
      valB = (b.displayName || b.name).toLowerCase();
    } else if (currentSortColumn === 'date') {
      valA = a.dateModified ? new Date(a.dateModified).getTime() : 0;
      valB = b.dateModified ? new Date(b.dateModified).getTime() : 0;
    } else if (currentSortColumn === 'type') {
      valA = a.type.toLowerCase();
      valB = b.type.toLowerCase();
    } else if (currentSortColumn === 'size') {
      valA = a.sizeRaw || 0;
      valB = b.sizeRaw || 0;
    }
    
    if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

// Render files list table rows
function renderExplorerContents() {
  filesTableBody.innerHTML = '';
  
  let items = getExplorerItems();
  items = sortItems(items);
  
  itemsCountText.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  
  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    filesTable.classList.add('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  filesTable.classList.remove('hidden');
  
  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    if (selectedRowIndex === index) {
      tr.classList.add('selected-row');
    }
    
    let iconHTML = '';
    if (item.isFolder) {
      iconHTML = `<i data-lucide="folder" class="item-icon folder-icon-color"></i>`;
    } else {
      iconHTML = `
        <svg class="item-icon excel-icon-color" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 3C4 2.44772 4.44772 2 5 2H14L20 8V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V3Z" fill="#107C41"/>
          <path d="M14 2L20 8H15C14.4477 8 14 7.55228 14 7V2Z" fill="#a3e635" opacity="0.85"/>
          <path d="M7 10H13V18H7V10Z" fill="white" opacity="0.2"/>
          <path d="M8.5 12L11.5 16M11.5 12L8.5 16" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
    
    let dateStr = '—';
    if (item.dateModified) {
      const d = new Date(item.dateModified);
      dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    
    const nameToDisplay = item.displayName || item.name;
    const displayNameHTML = searchQuery ? highlightText(nameToDisplay, searchQuery) : nameToDisplay;
    
    const actionHTML = item.isFolder 
      ? '' 
      : `<button class="table-download-btn" onclick="downloadFile('${item.relativePath}')" title="Download Excel">
          <i data-lucide="download"></i>
         </button>`;
         
    tr.innerHTML = `
      <td>
        <div class="cell-name-container">
          ${iconHTML}
          <span class="item-name-text" title="${nameToDisplay}">${displayNameHTML}</span>
        </div>
      </td>
      <td>${dateStr}</td>
      <td>${item.type}</td>
      <td>${item.isFolder ? '—' : item.size}</td>
      <td>${actionHTML}</td>
    `;
    
    tr.addEventListener('click', (e) => {
      document.querySelectorAll('.files-table tbody tr').forEach(row => {
        row.classList.remove('selected-row');
      });
      tr.classList.add('selected-row');
      selectedRowIndex = index;
      e.stopPropagation();
    });
    
    tr.addEventListener('dblclick', () => {
      if (item.isFolder) {
        navigateTo(item.path);
      } else {
        downloadFile(item.relativePath);
      }
    });
    
    filesTableBody.appendChild(tr);
  });
  
  initIcons();
}

function highlightText(text, search) {
  const esc = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${esc})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}

// Download Handler (using prefix-safe relative download path)
function downloadFile(relativePath) {
  const url = `api/download?file=${encodeURIComponent(relativePath)}`;
  window.open(url, '_blank');
}

// Search box input listener
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  if (searchQuery.trim().length > 0) {
    clearSearchBtn.style.display = 'flex';
  } else {
    clearSearchBtn.style.display = 'none';
  }
  renderExplorerContents();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  renderExplorerContents();
  searchInput.focus();
});

// Arrow Navigation listeners
btnBack.addEventListener('click', () => {
  if (historyIndex > 0) {
    historyIndex--;
    navigateTo(navigationHistory[historyIndex], false);
  }
});

btnForward.addEventListener('click', () => {
  if (historyIndex < navigationHistory.length - 1) {
    historyIndex++;
    navigateTo(navigationHistory[historyIndex], false);
  }
});

btnUp.addEventListener('click', () => {
  if (currentPath.length > 0) {
    const parentPath = currentPath.slice(0, -1);
    navigateTo(parentPath);
  }
});

btnRefresh.addEventListener('click', () => {
  fetchReports();
});


// Header column sorting click listeners
document.querySelectorAll('.files-table th').forEach(th => {
  const col = th.getAttribute('data-sort');
  if (col) {
    th.addEventListener('click', () => {
      if (currentSortColumn === col) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortColumn = col;
        currentSortOrder = 'asc';
      }
      renderExplorerContents();
    });
  }
});

document.addEventListener('click', () => {
  document.querySelectorAll('.files-table tbody tr').forEach(row => {
    row.classList.remove('selected-row');
  });
  selectedRowIndex = -1;
});

// Logout custom modal handling
const confirmModal = document.getElementById('confirm-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

if (btnLogout && confirmModal && modalCancelBtn && modalConfirmBtn) {
  btnLogout.addEventListener('click', () => {
    confirmModal.classList.remove('hidden');
  });

  modalCancelBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
  });

  // Close modal when clicking outside the card
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.classList.add('hidden');
    }
  });

  modalConfirmBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('api/logout', { method: 'POST' });
      if (response.ok) {
        window.location.href = 'login.html';
      } else {
        alert('Gagal logout.');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      confirmModal.classList.add('hidden');
    }
  });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  fetchReports();
});
