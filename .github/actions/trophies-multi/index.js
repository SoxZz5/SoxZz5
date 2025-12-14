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

// Themes matching github-profile-trophy exactly
const THEMES = {
  darkhub: {
    background: '#24292e',
    border: '#3d3d3d',
    title: '#ffffff',
    text: '#9e9e9e',
    icon: '#3d3d3d',
    rankS: { bg: '#ffd700', text: '#000' },
    rankA: { bg: '#c0c0c0', text: '#000' },
    rankB: { bg: '#cd7f32', text: '#fff' },
    rankC: { bg: '#555', text: '#fff' },
  },
  onedark: {
    background: '#282c34',
    border: '#3e4451',
    title: '#e5c07b',
    text: '#abb2bf',
    icon: '#3e4451',
    rankS: { bg: '#e5c07b', text: '#282c34' },
    rankA: { bg: '#98c379', text: '#282c34' },
    rankB: { bg: '#61afef', text: '#282c34' },
    rankC: { bg: '#4b5263', text: '#abb2bf' },
  },
  nord: {
    background: '#2e3440',
    border: '#3b4252',
    title: '#eceff4',
    text: '#d8dee9',
    icon: '#3b4252',
    rankS: { bg: '#ebcb8b', text: '#2e3440' },
    rankA: { bg: '#a3be8c', text: '#2e3440' },
    rankB: { bg: '#d08770', text: '#2e3440' },
    rankC: { bg: '#4c566a', text: '#eceff4' },
  },
  dracula: {
    background: '#282a36',
    border: '#44475a',
    title: '#f8f8f2',
    text: '#6272a4',
    icon: '#44475a',
    rankS: { bg: '#ffb86c', text: '#282a36' },
    rankA: { bg: '#50fa7b', text: '#282a36' },
    rankB: { bg: '#ff79c6', text: '#282a36' },
    rankC: { bg: '#44475a', text: '#f8f8f2' },
  },
  radical: {
    background: '#141321',
    border: '#1d1b2e',
    title: '#fe428e',
    text: '#a9fef7',
    icon: '#1d1b2e',
    rankS: { bg: '#fe428e', text: '#141321' },
    rankA: { bg: '#f8d847', text: '#141321' },
    rankB: { bg: '#a9fef7', text: '#141321' },
    rankC: { bg: '#2d2b40', text: '#a9fef7' },
  },
};

const TROPHY_DEFS = [
  { id: 'stars', title: 'Stars', key: 'totalStars', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'commits', title: 'Commits', key: 'totalCommits', thresholds: [1, 100, 500, 1000, 2000, 5000, 10000, 20000] },
  { id: 'followers', title: 'Followers', key: 'totalFollowers', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'repos', title: 'Repositories', key: 'totalRepos', thresholds: [1, 10, 30, 50, 80, 100, 150, 200] },
  { id: 'prs', title: 'PullRequest', key: 'totalPRs', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'issues', title: 'Issues', key: 'totalIssues', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'reviews', title: 'Reviews', key: 'totalReviews', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'experience', title: 'Experience', key: 'accountYears', thresholds: [1, 2, 3, 5, 7, 10, 15, 20] },
];

const RANKS = ['C', 'B', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'];

const STATS_QUERY = `
query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes { stargazerCount }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
    }
  }
}
`;

async function fetchUserStats(username, token) {
  console.log(`Fetching stats for ${username}...`);

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'trophies-multi'
    },
    body: JSON.stringify({ query: STATS_QUERY, variables: { login: username } })
  });

  if (!response.ok) throw new Error(`Failed for ${username}: ${response.status}`);

  const data = await response.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  if (!data.data?.user) throw new Error(`User ${username} not found`);

  const user = data.data.user;
  const contrib = user.contributionsCollection;
  const totalStars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const accountYears = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  const stats = {
    totalStars,
    totalCommits: contrib.totalCommitContributions + contrib.restrictedContributionsCount,
    totalFollowers: user.followers.totalCount,
    totalRepos: user.repositories.totalCount,
    totalPRs: contrib.totalPullRequestContributions,
    totalIssues: contrib.totalIssueContributions,
    totalReviews: contrib.totalPullRequestReviewContributions,
    accountYears
  };

  console.log(`  ${username}: ${stats.totalCommits} commits, ${stats.totalStars} stars`);
  return stats;
}

function mergeStats(allStats) {
  const merged = { totalStars: 0, totalCommits: 0, totalFollowers: 0, totalRepos: 0, totalPRs: 0, totalIssues: 0, totalReviews: 0, accountYears: 0 };
  for (const s of allStats) {
    merged.totalStars += s.totalStars;
    merged.totalCommits += s.totalCommits;
    merged.totalFollowers += s.totalFollowers;
    merged.totalRepos += s.totalRepos;
    merged.totalPRs += s.totalPRs;
    merged.totalIssues += s.totalIssues;
    merged.totalReviews += s.totalReviews;
    merged.accountYears = Math.max(merged.accountYears, s.accountYears);
  }
  return merged;
}

function getRank(value, thresholds) {
  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) rank = i;
  }
  return RANKS[rank] || 'C';
}

function getRankStyle(rank, theme) {
  if (rank.startsWith('S')) return theme.rankS;
  if (rank.startsWith('A')) return theme.rankA;
  if (rank === 'B') return theme.rankB;
  return theme.rankC;
}

function formatValue(value) {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
  return value.toString();
}

// Laurel wreath SVG for S and A ranks
function laurel(color, side) {
  const flip = side === 'right' ? 'scale(-1, 1) translate(-50, 0)' : '';
  return `
    <g transform="${flip}">
      <path d="M5,35 Q2,30 5,25 Q8,30 5,35" fill="${color}"/>
      <path d="M8,30 Q4,25 8,20 Q12,25 8,30" fill="${color}"/>
      <path d="M11,24 Q7,19 11,14 Q15,19 11,24" fill="${color}"/>
      <path d="M14,18 Q10,13 14,8 Q18,13 14,18" fill="${color}"/>
      <path d="M18,12 Q14,7 18,3 Q22,7 18,12" fill="${color}"/>
    </g>`;
}

function renderTrophy(trophy, stats, theme, x, y, size) {
  const value = stats[trophy.key];
  const rank = getRank(value, trophy.thresholds);
  const rankStyle = getRankStyle(rank, theme);
  const isHighRank = rank.startsWith('S') || rank.startsWith('A');
  const laurelColor = rank.startsWith('S') ? '#ffd700' : '#c0c0c0';

  let svg = `<g transform="translate(${x}, ${y})">`;

  // Background
  svg += `<rect width="${size}" height="${size}" rx="5" fill="${theme.background}"/>`;

  // Laurels for high ranks
  if (isHighRank) {
    svg += `<g transform="translate(${size/2 - 25}, ${size/2 - 15}) scale(0.8)">${laurel(laurelColor, 'left')}</g>`;
    svg += `<g transform="translate(${size/2 + 25}, ${size/2 - 15}) scale(0.8)">${laurel(laurelColor, 'right')}</g>`;
  }

  // Trophy cup with gradient
  const cupGradId = `cup_${x}_${y}`;
  svg += `
    <defs>
      <linearGradient id="${cupGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${rankStyle.bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${rankStyle.bg};stop-opacity:0.7" />
      </linearGradient>
    </defs>`;

  const cx = size / 2;
  const cy = size / 2 - 8;

  // Trophy cup shape
  svg += `
    <g transform="translate(${cx - 18}, ${cy - 22})">
      <!-- Cup body -->
      <path d="M8,0 L28,0 L26,22 L10,22 Z" fill="url(#${cupGradId})" stroke="${rankStyle.bg}" stroke-width="1"/>
      <!-- Cup rim -->
      <ellipse cx="18" cy="2" rx="12" ry="3" fill="${rankStyle.bg}"/>
      <!-- Left handle -->
      <path d="M8,5 Q0,5 0,12 Q0,19 8,19" fill="none" stroke="${rankStyle.bg}" stroke-width="3"/>
      <!-- Right handle -->
      <path d="M28,5 Q36,5 36,12 Q36,19 28,19" fill="none" stroke="${rankStyle.bg}" stroke-width="3"/>
      <!-- Stem -->
      <rect x="15" y="22" width="6" height="6" fill="${rankStyle.bg}"/>
      <!-- Base -->
      <rect x="10" y="28" width="16" height="4" rx="1" fill="${rankStyle.bg}"/>
      <!-- Rank letter on cup -->
      <text x="18" y="16" fill="${rankStyle.text}" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${rank}</text>
    </g>`;

  // Title
  svg += `<text x="${cx}" y="${size - 20}" fill="${theme.title}" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="600" text-anchor="middle">${trophy.title}</text>`;

  // Value
  svg += `<text x="${cx}" y="${size - 6}" fill="${theme.text}" font-family="Segoe UI,Arial,sans-serif" font-size="10" text-anchor="middle">${formatValue(value)}</text>`;

  svg += '</g>';
  return svg;
}

function generateTrophiesSvg(stats, themeName, column) {
  const theme = THEMES[themeName] || THEMES.darkhub;
  const size = 110;
  const margin = 5;

  const rows = Math.ceil(TROPHY_DEFS.length / column);
  const width = column * (size + margin) - margin;
  const height = rows * (size + margin) - margin;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

  TROPHY_DEFS.forEach((trophy, i) => {
    const col = i % column;
    const row = Math.floor(i / column);
    const x = col * (size + margin);
    const y = row * (size + margin);
    svg += renderTrophy(trophy, stats, theme, x, y, size);
  });

  svg += '</svg>';
  return svg;
}

async function run() {
  try {
    const userNamesInput = getInput('github_user_names', true);
    const tokensInput = getInput('github_tokens', true);
    const output = getInput('output') || 'dist/github-trophies.svg';
    const themeName = getInput('theme') || 'darkhub';
    const column = parseInt(getInput('column') || '4', 10);

    const userNames = userNamesInput.split(/[,\n]/).map(u => u.trim()).filter(u => u.length > 0);
    const tokens = tokensInput.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);

    if (tokens.length === 1) {
      while (tokens.length < userNames.length) tokens.push(tokens[0]);
    } else if (tokens.length !== userNames.length) {
      throw new Error(`Mismatch: ${userNames.length} usernames but ${tokens.length} tokens`);
    }

    console.log(`\n🏆 Multi-User Trophy Generator`);
    console.log(`   Users: ${userNames.join(', ')}`);
    console.log(`   Theme: ${themeName}\n`);

    const allStats = await Promise.all(
      userNames.map((username, i) => fetchUserStats(username, tokens[i]))
    );

    const mergedStats = mergeStats(allStats);
    console.log(`\n📊 Merged stats:`);
    console.log(`   Commits: ${mergedStats.totalCommits}`);
    console.log(`   Stars: ${mergedStats.totalStars}`);
    console.log(`   Followers: ${mergedStats.totalFollowers}\n`);

    console.log(`Generating ${output}...`);
    const svg = generateTrophiesSvg(mergedStats, themeName, column);

    const dir = path.dirname(output);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output, svg);

    console.log('✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
