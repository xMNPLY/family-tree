// GEDCOM Parser that handles photos and filters non-image files (like PDFs)
function parseRawGedcom(text) {
  const lines = text.split(/\r?\n/);
  const individuals = {};
  const families = {};
  
  let currentRecord = null;
  let currentType = null;
  let currentSubTag = null;

  const nonImageExtensions = ['.pdf', '.doc', '.docx', '.txt', '.html', '.mp3', '.mp4'];

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    const match = line.match(/^(\d+)\s+(@[^@]+@|[A-Z_]+)(?:\s+(.*))?$/);
    if (!match) return;

    const level = parseInt(match[1], 10);
    const tagOrPointer = match[2];
    const value = match[3] || '';

    if (level === 0) {
      if (value === 'INDI') {
        currentType = 'INDI';
        currentRecord = { id: tagOrPointer, name: '', gender: '', birth: '', death: '', famc: '', fams: [], photo: '' };
        individuals[tagOrPointer] = currentRecord;
      } else if (value === 'FAM') {
        currentType = 'FAM';
        currentRecord = { id: tagOrPointer, husband: null, wife: null, children: [] };
        families[tagOrPointer] = currentRecord;
      } else {
        currentType = null;
        currentRecord = null;
      }
    } else if (currentRecord) {
      if (currentType === 'INDI') {
        if (tagOrPointer === 'NAME') {
          currentRecord.name = value.replace(/\//g, '').trim();
        } else if (tagOrPointer === 'SEX') {
          currentRecord.gender = value === 'M' ? 'male' : value === 'F' ? 'female' : 'male';
        } else if (tagOrPointer === 'BIRT' || tagOrPointer === 'DEAT' || tagOrPointer === 'OBJE') {
          currentSubTag = tagOrPointer;
        } else if (tagOrPointer === 'DATE' && currentSubTag) {
          if (currentSubTag === 'BIRT') currentRecord.birth = value;
          if (currentSubTag === 'DEAT') currentRecord.death = value;
          currentSubTag = null;
        } else if (tagOrPointer === 'FILE' && currentSubTag === 'OBJE') {
          const cleanPath = value.trim().toLowerCase();
          const isNonImage = nonImageExtensions.some(ext => cleanPath.endsWith(ext));

          if (!currentRecord.photo && !isNonImage) {
            let originalPath = value.trim();
            if (!originalPath.startsWith('http') && !originalPath.startsWith('./') && !originalPath.startsWith('/')) {
              const fileName = originalPath.split(/[\\/]/).pop();
              originalPath = `./images/${fileName}`;
            }
            currentRecord.photo = originalPath;
          }
          currentSubTag = null;
        } else if (tagOrPointer === 'FAMC') {
          currentRecord.famc = value;
        } else if (tagOrPointer === 'FAMS') {
          currentRecord.fams.push(value);
        }
      } else if (currentType === 'FAM') {
        if (tagOrPointer === 'HUSB') currentRecord.husband = value;
        if (tagOrPointer === 'WIFE') currentRecord.wife = value;
        if (tagOrPointer === 'CHIL') currentRecord.children.push(value);
      }
    }
  });

  return { individuals, families };
}

async function loadFullGedcomTree() {
  const treeContainer = document.getElementById('tree');

  try {
    const response = await fetch('./family.ged');
    if (!response.ok) throw new Error("Could not find 'family.ged' in project root.");
    
    const gedcomText = await response.text();
    const { individuals, families } = parseRawGedcom(gedcomText);

    // Local SVG Fallback Avatars
    const malePlaceholder = 'images/m.svg';
    const femalePlaceholder = 'images/w.svg';

    const nodes = Object.values(individuals).map(person => {
      let fatherId = null;
      let motherId = null;

      if (person.famc && families[person.famc]) {
        fatherId = families[person.famc].husband || null;
        motherId = families[person.famc].wife || null;
      }

      const spouses = [];
      person.fams.forEach(famId => {
        const fam = families[famId];
        if (fam) {
          if (fam.husband && fam.husband !== person.id) spouses.push(fam.husband);
          if (fam.wife && fam.wife !== person.id) spouses.push(fam.wife);
        }
      });

      const photoUrl = person.photo ? person.photo : (person.gender === 'female' ? femalePlaceholder : malePlaceholder);

      return {
        id: person.id,
        fid: fatherId,
        mid: motherId,
        pids: spouses,
        name: person.name || 'Unknown',
        gender: person.gender || 'male',
        photo: photoUrl,
        birthDate: person.birth || '',
        deathDate: person.death || ''
      };
    });

    // Render tree initialized with Andrew Bolton as root node
    new FamilyTree(treeContainer, {
      nodes: nodes,
      focusNodeId: "@I500005@",
      nodeBinding: {
        field_0: 'name',
        field_1: 'birthDate',
        img_0: 'photo'
      },
      template: 'tommy',
      enableSearch: true,
      scaleInitial: FamilyTree.match.boundary,
      mouseScrool: FamilyTree.action.zoom
    });

  } catch (err) {
    console.error("Error loading tree:", err);
    if (treeContainer) {
      treeContainer.innerHTML = `<p style="color:#ef4444; padding:20px; font-family:sans-serif;">Error: ${err.message}</p>`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadFullGedcomTree);
} else {
  loadFullGedcomTree();
}
