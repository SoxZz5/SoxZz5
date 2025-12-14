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

// Full stats query including languages
const STATS_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
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
    repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        forkCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            size
            node { name color }
          }
        }
      }
    }
    pullRequests(first: 1) { totalCount }
    issues(first: 1) { totalCount }
    repositoriesContributedTo(first: 1) { totalCount }
  }
}
`;

async function fetchUserData(username, token) {
  console.log(`Fetching data for ${username}...`);

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': '3d-contrib-multi'
    },
    body: JSON.stringify({ query: STATS_QUERY, variables: { login: username } })
  });

  if (!response.ok) throw new Error(`Failed for ${username}: ${response.status}`);

  const data = await response.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  if (!data.data?.user) throw new Error(`User ${username} not found`);

  const user = data.data.user;
  const contrib = user.contributionsCollection;
  const calendar = contrib.contributionCalendar;

  console.log(`  ${username} has ${user.repositories.totalCount} repos (fetched ${user.repositories.nodes.length})`);

  // Parse contributions
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

  // Calculate stats
  const totalStars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const totalForks = user.repositories.nodes.reduce((sum, r) => sum + r.forkCount, 0);

  // Aggregate languages
  const langMap = new Map();
  for (const repo of user.repositories.nodes) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      const existing = langMap.get(name) || { name, color: edge.node.color, size: 0 };
      existing.size += edge.size;
      langMap.set(name, existing);
    }
  }
  // Keep more languages per user for better merging (will be trimmed to 6 after merge)
  const languages = Array.from(langMap.values()).sort((a, b) => b.size - a.size).slice(0, 15);

  // Use both contributionsCollection (yearly) and total counts
  const stats = {
    commits: contrib.totalCommitContributions + contrib.restrictedContributionsCount,
    issues: user.issues?.totalCount || contrib.totalIssueContributions,
    pullRequests: user.pullRequests?.totalCount || contrib.totalPullRequestContributions,
    reviews: contrib.totalPullRequestReviewContributions,
    repos: user.repositories.totalCount,
    totalContributions: calendar.totalContributions,
    totalStars,
    totalForks
  };

  console.log(`  ${username}:`);
  console.log(`    📅 Contributions: ${stats.totalContributions}`);
  console.log(`    💾 Commits: ${stats.commits} (${contrib.totalCommitContributions} public + ${contrib.restrictedContributionsCount} private)`);
  console.log(`    🔀 PRs: ${stats.pullRequests}, Issues: ${stats.issues}, Reviews: ${stats.reviews}`);
  console.log(`    📁 Repos: ${stats.repos}, Stars: ${stats.totalStars}, Forks: ${stats.totalForks}`);
  console.log(`    🔤 Languages (${languages.length}): ${languages.slice(0, 6).map(l => `${l.name}(${l.size})`).join(', ')}${languages.length > 6 ? '...' : ''}`);
  return { contributions, stats, languages };
}

function mergeUserData(allData) {
  console.log('Merging data from all users...');

  // Merge contributions by date
  const byDate = new Map();
  for (const { contributions } of allData) {
    for (const c of contributions) {
      if (byDate.has(c.date)) {
        byDate.get(c.date).count += c.count;
      } else {
        byDate.set(c.date, { ...c });
      }
    }
  }

  const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  let weekIndex = 0;
  let lastWeekday = -1;
  for (const c of sorted) {
    if (c.weekday <= lastWeekday) weekIndex++;
    c.weekIndex = weekIndex;
    lastWeekday = c.weekday;
  }

  // Merge stats
  const stats = { commits: 0, issues: 0, pullRequests: 0, reviews: 0, repos: 0, totalContributions: 0, totalStars: 0, totalForks: 0 };
  for (const { stats: s } of allData) {
    stats.commits += s.commits;
    stats.issues += s.issues;
    stats.pullRequests += s.pullRequests;
    stats.reviews += s.reviews;
    stats.repos += s.repos;
    stats.totalContributions += s.totalContributions;
    stats.totalStars += s.totalStars;
    stats.totalForks += s.totalForks;
  }

  // Merge languages
  const langMap = new Map();
  for (const { languages } of allData) {
    for (const lang of languages) {
      const existing = langMap.get(lang.name) || { name: lang.name, color: lang.color, size: 0 };
      existing.size += lang.size;
      langMap.set(lang.name, existing);
    }
  }
  const languages = Array.from(langMap.values()).sort((a, b) => b.size - a.size).slice(0, 6);

  console.log(`\n📊 MERGED TOTALS:`);
  console.log(`  📅 Total Contributions: ${stats.totalContributions}`);
  console.log(`  💾 Total Commits: ${stats.commits}`);
  console.log(`  🔀 Total PRs: ${stats.pullRequests}, Issues: ${stats.issues}, Reviews: ${stats.reviews}`);
  console.log(`  📁 Total Repos: ${stats.repos}, Stars: ${stats.totalStars}, Forks: ${stats.totalForks}`);
  console.log(`  🔤 Languages: ${languages.map(l => `${l.name}(${l.size})`).join(', ')}`);
  return { contributions: sorted, stats, languages };
}

function generateFullSVG(data, theme) {
  const { contributions, stats, languages } = data;

  const svgWidth = 850;
  const svgHeight = 520;
  const bg = '#0d1117';
  const textColor = '#8b949e';
  const gridColor = '#30363d';

  // Language pie chart area (LEFT side)
  const pieX = 75;
  const pieY = 150;

  // 3D map area (centered and bigger)
  const mapWidth = 580;
  const mapHeight = 400;
  const mapX = 20;  // Position more to the left for centering
  const mapY = 25;

  // Radar chart area (RIGHT side)
  const statsX = 550;
  const statsY = 50;

  const weeks = Math.max(...contributions.map(c => c.weekIndex)) + 1;
  const maxCount = Math.max(...contributions.map(c => c.count), 1);

  // Build contribution grid
  const grid = new Map();
  for (const c of contributions) {
    grid.set(`${c.weekIndex},${c.weekday}`, c.count);
  }

  // Date range
  const dates = contributions.map(c => c.date).sort();
  const startDate = dates[0] || '';
  const endDate = dates[dates.length - 1] || '';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="${svgWidth - 20}" y="25" fill="${textColor}" font-family="Segoe UI,sans-serif" font-size="11" text-anchor="end">${startDate} / ${endDate}</text>
`;

  // === 3D CONTRIBUTION MAP ===
  const cellW = 12;
  const cellD = 12;
  const maxH = 50;
  const angle = Math.PI / 6;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const toIso = (x, y, z) => ({
    x: mapX + mapWidth / 2 + (x - y) * cosA * 0.9,
    y: mapY + 80 + (x + y) * sinA * 0.9 - z
  });

  // Rainbow colors based on week position
  const getColor = (count, weekIdx) => {
    if (count === 0) return '#161b22';
    const hue = (weekIdx / weeks) * 300;
    const light = 25 + (count / maxCount) * 35;
    return `hsl(${hue}, 70%, ${light}%)`;
  };

  // Draw cells back to front
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const count = grid.get(`${w},${d}`) || 0;
      const h = count > 0 ? (count / maxCount) * maxH + 2 : 1;
      cells.push({ w, d, count, h, color: getColor(count, w) });
    }
  }
  cells.sort((a, b) => (a.w + a.d) - (b.w + b.d));

  for (const { w, d, h, color } of cells) {
    const x = w * cellW;
    const y = d * cellD;

    const tfl = toIso(x, y + cellD, h);
    const tfr = toIso(x + cellW, y + cellD, h);
    const tbl = toIso(x, y, h);
    const tbr = toIso(x + cellW, y, h);
    const bfl = toIso(x, y + cellD, 0);
    const bfr = toIso(x + cellW, y + cellD, 0);
    const bbr = toIso(x + cellW, y, 0);

    // Top
    svg += `  <polygon points="${tbl.x},${tbl.y} ${tbr.x},${tbr.y} ${tfr.x},${tfr.y} ${tfl.x},${tfl.y}" fill="${color}"/>\n`;
    if (h > 1) {
      // Front
      const frontColor = color.replace(/(\d+)%\)$/, (_, l) => `${Math.max(0, parseInt(l) - 10)}%)`);
      svg += `  <polygon points="${tfl.x},${tfl.y} ${tfr.x},${tfr.y} ${bfr.x},${bfr.y} ${bfl.x},${bfl.y}" fill="${frontColor}"/>\n`;
      // Right
      const rightColor = color.replace(/(\d+)%\)$/, (_, l) => `${Math.max(0, parseInt(l) - 18)}%)`);
      svg += `  <polygon points="${tfr.x},${tfr.y} ${tbr.x},${tbr.y} ${bbr.x},${bbr.y} ${bfr.x},${bfr.y}" fill="${rightColor}"/>\n`;
    }
  }

  // Day labels
  const days = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  for (let d = 1; d < 7; d += 2) {
    const pos = toIso(-15, d * cellD, 0);
    svg += `  <text x="${pos.x - 5}" y="${pos.y}" fill="${textColor}" font-size="9" text-anchor="end">${days[d]}</text>\n`;
  }

  // === RADAR CHART ===
  const radarX = statsX + 120;
  const radarY = statsY + 100;
  const radarR = 70;

  const radarLabels = ['Commit', 'Issue', 'PullReq', 'Review', 'Repo'];
  const radarValues = [
    Math.min(stats.commits / 1000, 1),
    Math.min(stats.issues / 100, 1),
    Math.min(stats.pullRequests / 100, 1),
    Math.min(stats.reviews / 100, 1),
    Math.min(stats.repos / 50, 1)
  ];

  // Radar background
  for (let ring = 5; ring >= 1; ring--) {
    const r = (ring / 5) * radarR;
    let points = '';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      points += `${radarX + Math.cos(a) * r},${radarY + Math.sin(a) * r} `;
    }
    svg += `  <polygon points="${points.trim()}" fill="none" stroke="${gridColor}" stroke-width="1"/>\n`;
  }

  // Radar axes and labels
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const x2 = radarX + Math.cos(a) * radarR;
    const y2 = radarY + Math.sin(a) * radarR;
    svg += `  <line x1="${radarX}" y1="${radarY}" x2="${x2}" y2="${y2}" stroke="${gridColor}" stroke-width="1"/>\n`;

    const lx = radarX + Math.cos(a) * (radarR + 20);
    const ly = radarY + Math.sin(a) * (radarR + 20);
    svg += `  <text x="${lx}" y="${ly}" fill="${textColor}" font-size="10" text-anchor="middle" dominant-baseline="middle">${radarLabels[i]}</text>\n`;
  }

  // Radar data polygon
  let radarPoints = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const r = Math.max(radarValues[i], 0.1) * radarR;
    radarPoints += `${radarX + Math.cos(a) * r},${radarY + Math.sin(a) * r} `;
  }
  svg += `  <polygon points="${radarPoints.trim()}" fill="rgba(200, 200, 50, 0.3)" stroke="#c8c832" stroke-width="2"/>\n`;

  // === LANGUAGE PIE CHART (LEFT SIDE) ===
  const pieR = 45;

  const totalSize = languages.reduce((sum, l) => sum + l.size, 0) || 1;
  let startAngle = -Math.PI / 2;

  // Pie chart label
  svg += `  <text x="${pieX}" y="${pieY - 60}" fill="#c9d1d9" font-family="Segoe UI,sans-serif" font-size="13" font-weight="600" text-anchor="middle">Languages</text>\n`;

  for (const lang of languages) {
    const slice = (lang.size / totalSize) * Math.PI * 2;
    const endAngle = startAngle + slice;

    const x1 = pieX + Math.cos(startAngle) * pieR;
    const y1 = pieY + Math.sin(startAngle) * pieR;
    const x2 = pieX + Math.cos(endAngle) * pieR;
    const y2 = pieY + Math.sin(endAngle) * pieR;
    const largeArc = slice > Math.PI ? 1 : 0;

    svg += `  <path d="M${pieX},${pieY} L${x1},${y1} A${pieR},${pieR} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${lang.color || '#666'}"/>\n`;
    startAngle = endAngle;
  }

  // Pie hole
  svg += `  <circle cx="${pieX}" cy="${pieY}" r="${pieR * 0.45}" fill="${bg}"/>\n`;

  // Language legend (below pie chart)
  let legendY = pieY + 70;
  for (const lang of languages.slice(0, 6)) {
    const pct = Math.round((lang.size / totalSize) * 100);
    svg += `  <rect x="${pieX - 50}" y="${legendY - 8}" width="12" height="12" rx="2" fill="${lang.color || '#666'}"/>\n`;
    svg += `  <text x="${pieX - 33}" y="${legendY}" fill="#c9d1d9" font-family="Segoe UI,sans-serif" font-size="11">${lang.name}</text>\n`;
    svg += `  <text x="${pieX + 55}" y="${legendY}" fill="${textColor}" font-family="Segoe UI,sans-serif" font-size="10" text-anchor="end">${pct}%</text>\n`;
    legendY += 18;
  }

  // === STATS FOOTER (BIGGER AND BETTER STYLED) ===
  const footerY = svgHeight - 35;
  const footerCenterX = mapX + mapWidth / 2;

  // Background bar for footer
  svg += `  <rect x="${footerCenterX - 200}" y="${footerY - 25}" width="400" height="45" rx="8" fill="#161b22" stroke="${gridColor}" stroke-width="1"/>\n`;

  // Contributions
  svg += `  <text x="${footerCenterX - 130}" y="${footerY}" fill="#58a6ff" font-family="Segoe UI,sans-serif" font-size="22" font-weight="bold">${stats.totalContributions.toLocaleString()}</text>\n`;
  svg += `  <text x="${footerCenterX - 130}" y="${footerY + 15}" fill="${textColor}" font-family="Segoe UI,sans-serif" font-size="11">contributions</text>\n`;

  // Stars
  svg += `  <text x="${footerCenterX + 20}" y="${footerY}" fill="#f0c14b" font-family="Segoe UI,sans-serif" font-size="20" font-weight="600">★ ${stats.totalStars.toLocaleString()}</text>\n`;
  svg += `  <text x="${footerCenterX + 20}" y="${footerY + 15}" fill="${textColor}" font-family="Segoe UI,sans-serif" font-size="11">stars</text>\n`;

  // Forks
  svg += `  <text x="${footerCenterX + 120}" y="${footerY}" fill="#8b949e" font-family="Segoe UI,sans-serif" font-size="20" font-weight="600">⑂ ${stats.totalForks.toLocaleString()}</text>\n`;
  svg += `  <text x="${footerCenterX + 120}" y="${footerY + 15}" fill="${textColor}" font-family="Segoe UI,sans-serif" font-size="11">forks</text>\n`;

  svg += '</svg>';
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
    console.log(`   Users: ${userNames.join(', ')}\n`);

    const allData = await Promise.all(
      userNames.map((username, i) => fetchUserData(username, tokens[i]))
    );

    const merged = mergeUserData(allData);
    console.log(`\n📊 Merged: ${merged.stats.totalContributions} contributions, ${merged.stats.commits} commits\n`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Generating ${outputDir}/profile-night-rainbow.svg...`);
    const svg = generateFullSVG(merged, theme);
    fs.writeFileSync(path.join(outputDir, 'profile-night-rainbow.svg'), svg);

    console.log('\n✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
