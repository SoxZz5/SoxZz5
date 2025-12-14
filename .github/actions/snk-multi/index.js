const fs = require('fs');
const path = require('path');

// Simple action helpers (no @actions/core dependency)
function getInput(name, required = false) {
  const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
  if (required && !val) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return val;
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

// GraphQL query to fetch contribution data
const CONTRIBUTION_QUERY = `
query($userName: String!) {
  user(login: $userName) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
            weekday
            date
          }
        }
      }
    }
  }
}
`;

// Contribution level mapping
const LEVEL_MAP = {
  'NONE': 0,
  'FIRST_QUARTILE': 1,
  'SECOND_QUARTILE': 2,
  'THIRD_QUARTILE': 3,
  'FOURTH_QUARTILE': 4
};

// Palettes for different themes
const PALETTES = {
  'github': ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  'github-dark': ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  'github-light': ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
};

async function fetchContributions(userName, token) {
  console.log(`Fetching contributions for ${userName}...`);

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'snk-multi-action'
    },
    body: JSON.stringify({
      query: CONTRIBUTION_QUERY,
      variables: { userName }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch contributions for ${userName}: ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error for ${userName}: ${JSON.stringify(data.errors)}`);
  }

  if (!data.data?.user) {
    throw new Error(`User ${userName} not found`);
  }

  const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks;
  const cells = [];

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      cells.push({
        x: weekIndex,
        y: day.weekday,
        count: day.contributionCount,
        level: LEVEL_MAP[day.contributionLevel] || 0,
        date: day.date
      });
    });
  });

  const totalContributions = cells.reduce((sum, c) => sum + c.count, 0);
  console.log(`  Found ${totalContributions} contributions for ${userName}`);
  return cells;
}

function mergeContributions(allContributions) {
  console.log('Merging contributions from all users (summing)...');

  const merged = new Map();

  for (const contributions of allContributions) {
    for (const cell of contributions) {
      const key = `${cell.x},${cell.y}`;
      if (merged.has(key)) {
        const existing = merged.get(key);
        existing.count += cell.count;
        // Recalculate level based on combined count using GitHub's approximate thresholds
        if (existing.count === 0) existing.level = 0;
        else if (existing.count <= 3) existing.level = 1;
        else if (existing.count <= 6) existing.level = 2;
        else if (existing.count <= 9) existing.level = 3;
        else existing.level = 4;
      } else {
        merged.set(key, { ...cell });
      }
    }
  }

  return Array.from(merged.values());
}

function createGrid(cells) {
  const maxX = Math.max(...cells.map(c => c.x));
  const maxY = Math.max(...cells.map(c => c.y));

  const width = maxX + 1;
  const height = maxY + 1;

  const grid = Array(height).fill(null).map(() => Array(width).fill(0));

  for (const cell of cells) {
    if (cell.level > 0) {
      grid[cell.y][cell.x] = cell.level;
    }
  }

  return { grid, width, height, cells };
}

// Solve snake path using greedy nearest neighbor
function solvePath(grid, width, height) {
  const cells = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] > 0) {
        cells.push({ x, y, level: grid[y][x] });
      }
    }
  }

  if (cells.length === 0) {
    return [{ x: 0, y: 0, action: 'move' }];
  }

  const path = [];
  const visited = new Set();
  let current = { x: 0, y: 0 };

  // Greedy nearest neighbor
  while (cells.length > visited.size) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      if (visited.has(key)) continue;

      const dist = Math.abs(cell.x - current.x) + Math.abs(cell.y - current.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = cell;
      }
    }

    if (!nearest) break;

    const key = `${nearest.x},${nearest.y}`;
    visited.add(key);

    // Move towards nearest cell step by step
    while (current.x !== nearest.x || current.y !== nearest.y) {
      if (current.x < nearest.x) current.x++;
      else if (current.x > nearest.x) current.x--;
      else if (current.y < nearest.y) current.y++;
      else if (current.y > nearest.y) current.y--;

      const isTarget = current.x === nearest.x && current.y === nearest.y;
      path.push({
        x: current.x,
        y: current.y,
        action: isTarget ? 'eat' : 'move',
        level: isTarget ? nearest.level : 0
      });
    }
  }

  // Return to start
  while (current.x !== 0 || current.y !== 0) {
    if (current.x > 0) current.x--;
    else if (current.y > 0) current.y--;
    path.push({ x: current.x, y: current.y, action: 'move' });
  }

  return path.length > 0 ? path : [{ x: 0, y: 0, action: 'move' }];
}

function generateAnimatedSvg(gridData, snakePath, palette, isDark) {
  const { width, height, cells } = gridData;
  const cellSize = 11;
  const gap = 3;
  const padding = 10;
  const snakeLength = 4;

  const svgWidth = width * (cellSize + gap) - gap + padding * 2;
  const svgHeight = height * (cellSize + gap) - gap + padding * 2;

  const colors = PALETTES[palette] || PALETTES['github'];
  const bgColor = isDark ? '#0d1117' : 'transparent';
  const snakeHeadColor = '#9be9a8';
  const snakeBodyColor = '#40c463';

  const cellMap = new Map();
  for (const cell of cells) {
    cellMap.set(`${cell.x},${cell.y}`, { ...cell });
  }

  // Find when each cell is eaten
  const eatTimes = new Map();
  for (let i = 0; i < snakePath.length; i++) {
    const step = snakePath[i];
    if (step.action === 'eat') {
      eatTimes.set(`${step.x},${step.y}`, i);
    }
  }

  const frameDuration = 15;
  const totalDuration = snakePath.length * frameDuration;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
`;

  if (isDark) {
    svg += `  <rect width="100%" height="100%" fill="${bgColor}"/>
`;
  }

  // Draw contribution cells with eat animation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cellMap.get(`${x},${y}`);
      const level = cell ? cell.level : 0;
      const color = colors[level];
      const px = padding + x * (cellSize + gap);
      const py = padding + y * (cellSize + gap);

      const eatStep = eatTimes.get(`${x},${y}`);

      if (eatStep !== undefined && level > 0) {
        const eatPercent = eatStep / snakePath.length;
        svg += `  <rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${color}">
    <animate attributeName="fill" values="${color};${colors[0]};${colors[0]};${color}" keyTimes="0;${eatPercent.toFixed(4)};0.9999;1" dur="${totalDuration}ms" repeatCount="indefinite"/>
  </rect>
`;
      } else {
        svg += `  <rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${color}"/>
`;
      }
    }
  }

  // Snake body segments (drawn back to front)
  for (let seg = snakeLength - 1; seg >= 0; seg--) {
    const segColor = seg === 0 ? snakeHeadColor : snakeBodyColor;
    const opacity = 1 - seg * 0.2;

    const xValues = [];
    const yValues = [];

    for (let i = 0; i < snakePath.length; i++) {
      const pathIdx = Math.max(0, i - seg);
      const pos = snakePath[pathIdx];
      xValues.push(padding + pos.x * (cellSize + gap));
      yValues.push(padding + pos.y * (cellSize + gap));
    }

    svg += `  <rect width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${segColor}" opacity="${opacity}">
    <animate attributeName="x" values="${xValues.join(';')}" dur="${totalDuration}ms" repeatCount="indefinite"/>
    <animate attributeName="y" values="${yValues.join(';')}" dur="${totalDuration}ms" repeatCount="indefinite"/>
  </rect>
`;
  }

  svg += `</svg>`;
  return svg;
}

async function run() {
  try {
    const userNamesInput = getInput('github_user_names', true);
    const tokensInput = getInput('github_tokens', true);
    const outputsRaw = getInput('outputs') || 'dist/github-snake.svg\ndist/github-snake-dark.svg?palette=github-dark';

    // Support both comma-separated and newline-separated formats
    const userNames = userNamesInput
      .split(/[,\n]/)
      .map(u => u.trim())
      .filter(u => u.length > 0);

    const tokens = tokensInput
      .split(/[,\n]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // Validate that we have matching counts
    if (tokens.length === 1) {
      // Single token for all users
      while (tokens.length < userNames.length) {
        tokens.push(tokens[0]);
      }
    } else if (tokens.length !== userNames.length) {
      throw new Error(`Mismatch: ${userNames.length} usernames but ${tokens.length} tokens. Provide one token per user, or a single token for all.`);
    }

    console.log(`\n🐍 Multi-User Snake Generator`);
    console.log(`   Users: ${userNames.join(', ')}`);
    console.log(`   Tokens: ${tokens.length} provided\n`);

    // Fetch contributions for all users with their respective tokens
    const allContributions = await Promise.all(
      userNames.map((userName, index) => fetchContributions(userName, tokens[index]))
    );

    // Merge contributions
    const mergedCells = mergeContributions(allContributions);
    const totalMerged = mergedCells.reduce((sum, c) => sum + c.count, 0);
    console.log(`\n📊 Total merged contributions: ${totalMerged}\n`);

    // Create grid
    const gridData = createGrid(mergedCells);
    console.log(`Grid dimensions: ${gridData.width} weeks x ${gridData.height} days`);

    // Solve snake path
    console.log('Computing snake path...');
    const snakePath = solvePath(gridData.grid, gridData.width, gridData.height);
    console.log(`Snake path: ${snakePath.length} steps, ${snakePath.filter(s => s.action === 'eat').length} cells to eat\n`);

    // Parse outputs and generate files
    const outputs = outputsRaw.split('\n').map(o => o.trim()).filter(o => o.length > 0);

    for (const output of outputs) {
      const [filePath, queryString] = output.split('?');
      const params = new URLSearchParams(queryString || '');
      const palette = params.get('palette') || 'github';
      const isDark = palette.includes('dark');

      console.log(`Generating: ${filePath} (${palette})`);

      const dir = path.dirname(filePath);
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const svg = generateAnimatedSvg(gridData, snakePath, palette, isDark);
      fs.writeFileSync(filePath, svg);
    }

    console.log('\n✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
