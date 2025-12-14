const fs = require('fs');
const path = require('path');

function getInput(name, required = false) {
  const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
  if (required && !val) throw new Error(`Input required: ${name}`);
  return val;
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

// GraphQL query for contribution calendar
const CONTRIBUTION_QUERY = `
query($login: String!) {
  user(login: $login) {
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

// Night rainbow color theme
const THEMES = {
  'night-rainbow': {
    background: '#0d1117',
    text: '#8b949e',
    getColor: (count, maxCount, weekIndex, totalWeeks) => {
      if (count === 0) return '#161b22';
      // Rainbow based on position + intensity based on count
      const hue = (weekIndex / totalWeeks) * 360;
      const saturation = 80;
      const lightness = 30 + (count / maxCount) * 40;
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
  },
  'night-green': {
    background: '#0d1117',
    text: '#8b949e',
    getColor: (count, maxCount) => {
      if (count === 0) return '#161b22';
      const intensity = count / maxCount;
      const colors = ['#0e4429', '#006d32', '#26a641', '#39d353'];
      const idx = Math.min(Math.floor(intensity * 4), 3);
      return colors[idx];
    }
  },
  'night-view': {
    background: '#0d1117',
    text: '#8b949e',
    getColor: (count, maxCount) => {
      if (count === 0) return '#161b22';
      const intensity = count / maxCount;
      return `hsl(210, 100%, ${20 + intensity * 50}%)`;
    }
  },
  'green': {
    background: '#ffffff',
    text: '#24292f',
    getColor: (count, maxCount) => {
      if (count === 0) return '#ebedf0';
      const colors = ['#9be9a8', '#40c463', '#30a14e', '#216e39'];
      const intensity = count / maxCount;
      const idx = Math.min(Math.floor(intensity * 4), 3);
      return colors[idx];
    }
  }
};

async function fetchContributions(username, token) {
  console.log(`Fetching contributions for ${username}...`);

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': '3d-contrib-multi'
    },
    body: JSON.stringify({ query: CONTRIBUTION_QUERY, variables: { login: username } })
  });

  if (!response.ok) throw new Error(`Failed for ${username}: ${response.status}`);

  const data = await response.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  if (!data.data?.user) throw new Error(`User ${username} not found`);

  const calendar = data.data.user.contributionsCollection.contributionCalendar;
  const contributions = [];

  calendar.weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      contributions.push({
        date: day.date,
        count: day.contributionCount,
        weekday: day.weekday,
        weekIndex
      });
    });
  });

  const total = contributions.reduce((sum, c) => sum + c.count, 0);
  console.log(`  ${username}: ${total} contributions`);
  return contributions;
}

function mergeContributions(allContributions) {
  console.log('Merging contributions by date...');
  const byDate = new Map();

  for (const contributions of allContributions) {
    for (const c of contributions) {
      if (byDate.has(c.date)) {
        byDate.get(c.date).count += c.count;
      } else {
        byDate.set(c.date, { ...c });
      }
    }
  }

  const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Reassign week indices
  let weekIndex = 0;
  let lastWeekday = -1;
  for (const c of sorted) {
    if (c.weekday <= lastWeekday) weekIndex++;
    c.weekIndex = weekIndex;
    lastWeekday = c.weekday;
  }

  return sorted;
}

function generate3DSVG(contributions, theme) {
  const themeConfig = THEMES[theme] || THEMES['night-rainbow'];

  // Grid dimensions
  const weeks = Math.max(...contributions.map(c => c.weekIndex)) + 1;
  const days = 7;

  // Isometric settings
  const cellWidth = 14;
  const cellDepth = 14;
  const maxHeight = 50;
  const isoAngle = 30 * Math.PI / 180;

  // Calculate max count for scaling
  const maxCount = Math.max(...contributions.map(c => c.count), 1);

  // SVG dimensions
  const padding = 60;
  const isoWidth = weeks * cellWidth * Math.cos(isoAngle) + days * cellDepth * Math.cos(isoAngle);
  const isoHeight = weeks * cellWidth * Math.sin(isoAngle) + days * cellDepth * Math.sin(isoAngle) + maxHeight;
  const svgWidth = isoWidth + padding * 2;
  const svgHeight = isoHeight + padding * 2 + 40;

  // Create contribution map
  const grid = new Map();
  for (const c of contributions) {
    grid.set(`${c.weekIndex},${c.weekday}`, c.count);
  }

  // Isometric transformation functions
  const toIso = (x, y, z) => {
    const isoX = (x - y) * Math.cos(isoAngle);
    const isoY = (x + y) * Math.sin(isoAngle) - z;
    return { x: isoX + svgWidth / 2, y: isoY + padding + maxHeight };
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="${themeConfig.background}"/>
  <defs>
    <linearGradient id="topGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0.2)"/>
      <stop offset="100%" style="stop-color:rgba(0,0,0,0.1)"/>
    </linearGradient>
  </defs>
`;

  // Draw cells back to front for proper overlap
  const cells = [];
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < days; day++) {
      const count = grid.get(`${week},${day}`) || 0;
      const height = count > 0 ? (count / maxCount) * maxHeight + 3 : 2;
      const color = themeConfig.getColor(count, maxCount, week, weeks);
      cells.push({ week, day, count, height, color });
    }
  }

  // Sort for proper z-ordering (back to front)
  cells.sort((a, b) => (a.week + a.day) - (b.week + b.day));

  for (const { week, day, count, height, color } of cells) {
    const x = week * cellWidth;
    const y = day * cellDepth;
    const z = 0;

    // Calculate corners for the 3D box
    const topFrontLeft = toIso(x, y + cellDepth, z + height);
    const topFrontRight = toIso(x + cellWidth, y + cellDepth, z + height);
    const topBackLeft = toIso(x, y, z + height);
    const topBackRight = toIso(x + cellWidth, y, z + height);
    const bottomFrontLeft = toIso(x, y + cellDepth, z);
    const bottomFrontRight = toIso(x + cellWidth, y + cellDepth, z);

    // Darken/lighten variants
    const darken = (hex, amount) => {
      if (hex.startsWith('hsl')) return hex.replace(/(\d+)%\)$/, (_, l) => `${Math.max(0, parseInt(l) - amount)}%)`);
      return hex;
    };
    const lighten = (hex, amount) => {
      if (hex.startsWith('hsl')) return hex.replace(/(\d+)%\)$/, (_, l) => `${Math.min(100, parseInt(l) + amount)}%)`);
      return hex;
    };

    // Draw top face
    svg += `  <polygon points="${topBackLeft.x},${topBackLeft.y} ${topBackRight.x},${topBackRight.y} ${topFrontRight.x},${topFrontRight.y} ${topFrontLeft.x},${topFrontLeft.y}" fill="${color}" stroke="${themeConfig.background}" stroke-width="0.5"/>
`;

    // Draw front face (if height > 0)
    if (height > 2) {
      const frontColor = darken(color, 15);
      svg += `  <polygon points="${topFrontLeft.x},${topFrontLeft.y} ${topFrontRight.x},${topFrontRight.y} ${bottomFrontRight.x},${bottomFrontRight.y} ${bottomFrontLeft.x},${bottomFrontLeft.y}" fill="${frontColor}" stroke="${themeConfig.background}" stroke-width="0.5"/>
`;

      // Draw right face
      const rightColor = darken(color, 25);
      const bottomBackRight = toIso(x + cellWidth, y, z);
      svg += `  <polygon points="${topFrontRight.x},${topFrontRight.y} ${topBackRight.x},${topBackRight.y} ${bottomBackRight.x},${bottomBackRight.y} ${bottomFrontRight.x},${bottomFrontRight.y}" fill="${rightColor}" stroke="${themeConfig.background}" stroke-width="0.5"/>
`;
    }
  }

  // Add title
  const totalContrib = contributions.reduce((sum, c) => sum + c.count, 0);
  svg += `  <text x="${svgWidth / 2}" y="${svgHeight - 15}" fill="${themeConfig.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">${totalContrib.toLocaleString()} contributions in the last year</text>
`;

  // Add day labels
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let d = 0; d < 7; d += 2) {
    const pos = toIso(-20, d * cellDepth + cellDepth / 2, 0);
    svg += `  <text x="${pos.x - 30}" y="${pos.y}" fill="${themeConfig.text}" font-family="Segoe UI, sans-serif" font-size="10" text-anchor="end" dominant-baseline="middle">${dayLabels[d]}</text>
`;
  }

  svg += '</svg>';
  return svg;
}

function generateAnimatedSVG(contributions, theme) {
  const themeConfig = THEMES[theme] || THEMES['night-rainbow'];

  const weeks = Math.max(...contributions.map(c => c.weekIndex)) + 1;
  const days = 7;
  const cellWidth = 14;
  const cellDepth = 14;
  const maxHeight = 50;
  const isoAngle = 30 * Math.PI / 180;
  const maxCount = Math.max(...contributions.map(c => c.count), 1);

  const padding = 60;
  const isoWidth = weeks * cellWidth * Math.cos(isoAngle) + days * cellDepth * Math.cos(isoAngle);
  const isoHeight = weeks * cellWidth * Math.sin(isoAngle) + days * cellDepth * Math.sin(isoAngle) + maxHeight;
  const svgWidth = isoWidth + padding * 2;
  const svgHeight = isoHeight + padding * 2 + 40;

  const grid = new Map();
  for (const c of contributions) {
    grid.set(`${c.weekIndex},${c.weekday}`, c.count);
  }

  const toIso = (x, y, z) => {
    const isoX = (x - y) * Math.cos(isoAngle);
    const isoY = (x + y) * Math.sin(isoAngle) - z;
    return { x: isoX + svgWidth / 2, y: isoY + padding + maxHeight };
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <style>
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    @keyframes rainbow {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    .cell { animation: pulse 3s ease-in-out infinite; }
    .rainbow-group { animation: rainbow 10s linear infinite; }
  </style>
  <rect width="100%" height="100%" fill="${themeConfig.background}"/>
  <g class="rainbow-group">
`;

  const cells = [];
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < days; day++) {
      const count = grid.get(`${week},${day}`) || 0;
      const height = count > 0 ? (count / maxCount) * maxHeight + 3 : 2;
      const color = themeConfig.getColor(count, maxCount, week, weeks);
      cells.push({ week, day, count, height, color });
    }
  }

  cells.sort((a, b) => (a.week + a.day) - (b.week + b.day));

  for (const { week, day, count, height, color } of cells) {
    const x = week * cellWidth;
    const y = day * cellDepth;
    const delay = ((week + day) / (weeks + days)) * 2;

    const topFrontLeft = toIso(x, y + cellDepth, height);
    const topFrontRight = toIso(x + cellWidth, y + cellDepth, height);
    const topBackLeft = toIso(x, y, height);
    const topBackRight = toIso(x + cellWidth, y, height);
    const bottomFrontLeft = toIso(x, y + cellDepth, 0);
    const bottomFrontRight = toIso(x + cellWidth, y + cellDepth, 0);
    const bottomBackRight = toIso(x + cellWidth, y, 0);

    const darken = (hex, amount) => {
      if (hex.startsWith('hsl')) return hex.replace(/(\d+)%\)$/, (_, l) => `${Math.max(0, parseInt(l) - amount)}%)`);
      return hex;
    };

    const cellClass = count > 0 ? 'cell' : '';
    const style = count > 0 ? `animation-delay: ${delay}s;` : '';

    svg += `  <g class="${cellClass}" style="${style}">
    <polygon points="${topBackLeft.x},${topBackLeft.y} ${topBackRight.x},${topBackRight.y} ${topFrontRight.x},${topFrontRight.y} ${topFrontLeft.x},${topFrontLeft.y}" fill="${color}"/>
`;
    if (height > 2) {
      svg += `    <polygon points="${topFrontLeft.x},${topFrontLeft.y} ${topFrontRight.x},${topFrontRight.y} ${bottomFrontRight.x},${bottomFrontRight.y} ${bottomFrontLeft.x},${bottomFrontLeft.y}" fill="${darken(color, 15)}"/>
    <polygon points="${topFrontRight.x},${topFrontRight.y} ${topBackRight.x},${topBackRight.y} ${bottomBackRight.x},${bottomBackRight.y} ${bottomFrontRight.x},${bottomFrontRight.y}" fill="${darken(color, 25)}"/>
`;
    }
    svg += `  </g>
`;
  }

  const total = contributions.reduce((sum, c) => sum + c.count, 0);
  svg += `  </g>
  <text x="${svgWidth / 2}" y="${svgHeight - 15}" fill="${themeConfig.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">${total.toLocaleString()} contributions in the last year</text>
</svg>`;

  return svg;
}

async function run() {
  try {
    const userNamesInput = getInput('github_user_names', true);
    const tokensInput = getInput('github_tokens', true);
    const outputDir = getInput('output_dir') || 'profile-3d-contrib';
    const theme = getInput('theme') || 'night-rainbow';

    const userNames = userNamesInput.split(/[,\n]/).map(u => u.trim()).filter(u => u.length > 0);
    const tokens = tokensInput.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);

    if (tokens.length === 1) {
      while (tokens.length < userNames.length) tokens.push(tokens[0]);
    } else if (tokens.length !== userNames.length) {
      throw new Error(`Mismatch: ${userNames.length} usernames but ${tokens.length} tokens`);
    }

    console.log(`\n📊 Multi-User 3D Contribution Map`);
    console.log(`   Users: ${userNames.join(', ')}`);
    console.log(`   Theme: ${theme}\n`);

    const allContributions = await Promise.all(
      userNames.map((username, i) => fetchContributions(username, tokens[i]))
    );

    const merged = mergeContributions(allContributions);
    const total = merged.reduce((sum, c) => sum + c.count, 0);
    console.log(`\n📊 Merged: ${total} total contributions\n`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate static SVG
    console.log(`Generating ${outputDir}/profile-${theme}.svg...`);
    const staticSvg = generate3DSVG(merged, theme);
    fs.writeFileSync(path.join(outputDir, `profile-${theme}.svg`), staticSvg);

    // Generate animated SVG
    console.log(`Generating ${outputDir}/profile-${theme}-animate.svg...`);
    const animatedSvg = generateAnimatedSVG(merged, theme);
    fs.writeFileSync(path.join(outputDir, `profile-${theme}-animate.svg`), animatedSvg);

    console.log('\n✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
