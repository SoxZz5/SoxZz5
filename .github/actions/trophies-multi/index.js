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

// Themes matching github-profile-trophy
const THEMES = {
  'darkhub': {
    bg: '#24292f', title: '#FFFFFF', text: '#A0A0A0', frame: '#3D3D3D',
    s: { base: '#FFD700', shadow: '#B8860B', text: '#000' },
    a: { base: '#C0C0C0', shadow: '#808080', text: '#000' },
    b: { base: '#CD7F32', shadow: '#8B4513', text: '#FFF' },
    c: { base: '#4A4A4A', shadow: '#2D2D2D', text: '#FFF' },
    laurel: '#FFD700', bar: '#3D3D3D'
  },
  'onedark': {
    bg: '#282C34', title: '#E5C07B', text: '#ABB2BF', frame: '#3E4451',
    s: { base: '#E5C07B', shadow: '#D19A66', text: '#282C34' },
    a: { base: '#98C379', shadow: '#7EAE5D', text: '#282C34' },
    b: { base: '#61AFEF', shadow: '#4D8AC9', text: '#282C34' },
    c: { base: '#4B5263', shadow: '#3B4048', text: '#ABB2BF' },
    laurel: '#E5C07B', bar: '#3E4451'
  },
  'gruvbox': {
    bg: '#282828', title: '#FABD2F', text: '#EBDBB2', frame: '#3C3836',
    s: { base: '#FABD2F', shadow: '#D79921', text: '#282828' },
    a: { base: '#B8BB26', shadow: '#98971A', text: '#282828' },
    b: { base: '#FE8019', shadow: '#D65D0E', text: '#282828' },
    c: { base: '#504945', shadow: '#3C3836', text: '#EBDBB2' },
    laurel: '#FABD2F', bar: '#3C3836'
  },
  'dracula': {
    bg: '#282A36', title: '#F8F8F2', text: '#6272A4', frame: '#44475A',
    s: { base: '#FFB86C', shadow: '#E59A50', text: '#282A36' },
    a: { base: '#50FA7B', shadow: '#3AD65E', text: '#282A36' },
    b: { base: '#FF79C6', shadow: '#E55DAA', text: '#282A36' },
    c: { base: '#44475A', shadow: '#2D303E', text: '#F8F8F2' },
    laurel: '#FFB86C', bar: '#44475A'
  },
  'monokai': {
    bg: '#272822', title: '#F8F8F2', text: '#75715E', frame: '#3E3D32',
    s: { base: '#E6DB74', shadow: '#C9BF5A', text: '#272822' },
    a: { base: '#A6E22E', shadow: '#8BC620', text: '#272822' },
    b: { base: '#FD971F', shadow: '#D87C15', text: '#272822' },
    c: { base: '#49483E', shadow: '#3C3B32', text: '#F8F8F2' },
    laurel: '#E6DB74', bar: '#3E3D32'
  },
  'nord': {
    bg: '#2E3440', title: '#ECEFF4', text: '#D8DEE9', frame: '#3B4252',
    s: { base: '#EBCB8B', shadow: '#D1B06F', text: '#2E3440' },
    a: { base: '#A3BE8C', shadow: '#8FA876', text: '#2E3440' },
    b: { base: '#D08770', shadow: '#B66F5A', text: '#2E3440' },
    c: { base: '#4C566A', shadow: '#3B4252', text: '#ECEFF4' },
    laurel: '#EBCB8B', bar: '#3B4252'
  },
  'tokyonight': {
    bg: '#1A1B26', title: '#C0CAF5', text: '#565F89', frame: '#24283B',
    s: { base: '#E0AF68', shadow: '#C6964F', text: '#1A1B26' },
    a: { base: '#9ECE6A', shadow: '#84B450', text: '#1A1B26' },
    b: { base: '#F7768E', shadow: '#DD5C74', text: '#1A1B26' },
    c: { base: '#414868', shadow: '#2D3452', text: '#C0CAF5' },
    laurel: '#E0AF68', bar: '#24283B'
  },
  'radical': {
    bg: '#141321', title: '#FE428E', text: '#A9FEF7', frame: '#1D1B2E',
    s: { base: '#FE428E', shadow: '#E52874', text: '#141321' },
    a: { base: '#F8D847', shadow: '#DEBE2D', text: '#141321' },
    b: { base: '#A9FEF7', shadow: '#8FE4DD', text: '#141321' },
    c: { base: '#2D2B40', shadow: '#1D1B2E', text: '#A9FEF7' },
    laurel: '#FE428E', bar: '#1D1B2E'
  }
};

const TROPHY_DEFS = [
  { id: 'stars', title: 'Stars', key: 'totalStars', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'commits', title: 'Commits', key: 'totalCommits', thresholds: [1, 100, 500, 1000, 2000, 5000, 10000, 20000] },
  { id: 'followers', title: 'Followers', key: 'totalFollowers', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
  { id: 'repos', title: 'Repositories', key: 'totalRepos', thresholds: [1, 10, 30, 50, 80, 100, 150, 200] },
  { id: 'prs', title: 'Pull Requests', key: 'totalPRs', thresholds: [1, 10, 50, 100, 200, 500, 1000, 2000] },
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
      'User-Agent': 'trophies-multi-action'
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

function formatValue(value) {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
  return value.toString();
}

function getRankStyle(rank, theme) {
  if (rank.startsWith('S')) return theme.s;
  if (rank.startsWith('A')) return theme.a;
  if (rank === 'B') return theme.b;
  return theme.c;
}

// Trophy cup SVG icon
function trophyIcon(color, shadowColor) {
  return `
    <g transform="translate(35, 15)">
      <!-- Trophy cup -->
      <path d="M20 8h4c2.2 0 4 1.8 4 4v2c0 2.2-1.8 4-4 4h-1.5c-.8 2.9-3 5.2-5.5 6v4h6v4H17v-4h6v-4h-6v-4c-2.5-.8-4.7-3.1-5.5-6H10c-2.2 0-4-1.8-4-4v-2c0-2.2 1.8-4 4-4h4V4c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4v4h-6z"
            fill="${shadowColor}" transform="translate(1, 1)"/>
      <path d="M20 8h4c2.2 0 4 1.8 4 4v2c0 2.2-1.8 4-4 4h-1.5c-.8 2.9-3 5.2-5.5 6v4h6v4H17v-4h6v-4h-6v-4c-2.5-.8-4.7-3.1-5.5-6H10c-2.2 0-4-1.8-4-4v-2c0-2.2 1.8-4 4-4h4V4c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4v4h-6z"
            fill="${color}"/>
      <!-- Cup body simplified -->
      <ellipse cx="20" cy="25" rx="12" ry="15" fill="${shadowColor}" transform="translate(1, 1)"/>
      <ellipse cx="20" cy="25" rx="12" ry="15" fill="${color}"/>
      <!-- Handles -->
      <path d="M6 18c-2 0-4 2-4 4s2 4 4 4" stroke="${shadowColor}" stroke-width="3" fill="none" transform="translate(1, 1)"/>
      <path d="M6 18c-2 0-4 2-4 4s2 4 4 4" stroke="${color}" stroke-width="3" fill="none"/>
      <path d="M34 18c2 0 4 2 4 4s-2 4-4 4" stroke="${shadowColor}" stroke-width="3" fill="none" transform="translate(1, 1)"/>
      <path d="M34 18c2 0 4 2 4 4s-2 4-4 4" stroke="${color}" stroke-width="3" fill="none"/>
      <!-- Base -->
      <rect x="14" y="50" width="12" height="4" rx="1" fill="${shadowColor}" transform="translate(1, 1)"/>
      <rect x="14" y="50" width="12" height="4" rx="1" fill="${color}"/>
      <rect x="10" y="54" width="20" height="4" rx="1" fill="${shadowColor}" transform="translate(1, 1)"/>
      <rect x="10" y="54" width="20" height="4" rx="1" fill="${color}"/>
    </g>`;
}

// Simpler trophy that actually renders well
function simpleTrophy(rankStyle, rank) {
  const { base, shadow, text } = rankStyle;

  return `
    <g transform="translate(55, 25) scale(0.8)">
      <!-- Cup body -->
      <path d="M0 10 L5 40 L35 40 L40 10 Z" fill="${shadow}" transform="translate(1,1)"/>
      <path d="M0 10 L5 40 L35 40 L40 10 Z" fill="${base}"/>

      <!-- Cup rim -->
      <ellipse cx="20" cy="10" rx="22" ry="6" fill="${shadow}" transform="translate(1,1)"/>
      <ellipse cx="20" cy="10" rx="22" ry="6" fill="${base}"/>

      <!-- Left handle -->
      <path d="M0 14 Q-10 14 -10 24 Q-10 34 0 34" stroke="${shadow}" stroke-width="4" fill="none" transform="translate(1,1)"/>
      <path d="M0 14 Q-10 14 -10 24 Q-10 34 0 34" stroke="${base}" stroke-width="4" fill="none"/>

      <!-- Right handle -->
      <path d="M40 14 Q50 14 50 24 Q50 34 40 34" stroke="${shadow}" stroke-width="4" fill="none" transform="translate(1,1)"/>
      <path d="M40 14 Q50 14 50 24 Q50 34 40 34" stroke="${base}" stroke-width="4" fill="none"/>

      <!-- Stem -->
      <rect x="15" y="40" width="10" height="8" fill="${shadow}" transform="translate(1,1)"/>
      <rect x="15" y="40" width="10" height="8" fill="${base}"/>

      <!-- Base -->
      <rect x="8" y="48" width="24" height="6" rx="2" fill="${shadow}" transform="translate(1,1)"/>
      <rect x="8" y="48" width="24" height="6" rx="2" fill="${base}"/>

      <!-- Rank text on cup -->
      <text x="20" y="30" fill="${text}" font-family="Segoe UI,sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${rank}</text>
    </g>`;
}

// Laurel wreath for S ranks
function laurelWreath(color) {
  return `
    <g transform="translate(55, 65) scale(0.6)">
      <!-- Left laurel -->
      <path d="M-5 0 Q-15 -10 -10 -25 Q-5 -15 -5 0" fill="${color}" opacity="0.9"/>
      <path d="M-8 -5 Q-20 -15 -15 -35 Q-8 -20 -8 -5" fill="${color}" opacity="0.8"/>
      <path d="M-10 -15 Q-25 -25 -18 -45 Q-10 -30 -10 -15" fill="${color}" opacity="0.7"/>

      <!-- Right laurel -->
      <path d="M5 0 Q15 -10 10 -25 Q5 -15 5 0" fill="${color}" opacity="0.9"/>
      <path d="M8 -5 Q20 -15 15 -35 Q8 -20 8 -5" fill="${color}" opacity="0.8"/>
      <path d="M10 -15 Q25 -25 18 -45 Q10 -30 10 -15" fill="${color}" opacity="0.7"/>
    </g>`;
}

function renderTrophy(trophy, stats, theme, x, y, size, noFrame, noBg) {
  const value = stats[trophy.key];
  const rank = getRank(value, trophy.thresholds);
  const rankStyle = getRankStyle(rank, theme);
  const isHighRank = rank.startsWith('S') || rank.startsWith('A');

  let svg = `<g transform="translate(${x}, ${y})">`;

  // Background
  if (!noBg) {
    svg += `<rect width="${size}" height="${size}" rx="8" fill="${theme.bg}"/>`;
  }

  // Frame
  if (!noFrame) {
    svg += `<rect x="1" y="1" width="${size-2}" height="${size-2}" rx="8" fill="none" stroke="${theme.frame}" stroke-width="1"/>`;
  }

  // Laurel for high ranks
  if (isHighRank) {
    svg += laurelWreath(theme.laurel);
  }

  // Trophy icon
  svg += simpleTrophy(rankStyle, rank);

  // Title
  svg += `<text x="${size/2}" y="${size - 22}" fill="${theme.title}" font-family="Segoe UI,sans-serif" font-size="11" font-weight="600" text-anchor="middle">${trophy.title}</text>`;

  // Value
  svg += `<text x="${size/2}" y="${size - 8}" fill="${theme.text}" font-family="Segoe UI,sans-serif" font-size="10" text-anchor="middle">${formatValue(value)}</text>`;

  svg += '</g>';
  return svg;
}

function generateTrophiesSvg(stats, options) {
  const { theme, noFrame, noBg, column, marginW, marginH } = options;
  const trophySize = 110;

  const rows = Math.ceil(TROPHY_DEFS.length / column);
  const width = column * trophySize + (column - 1) * marginW;
  const height = rows * trophySize + (rows - 1) * marginH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

  // Optional background for entire SVG
  if (!noBg) {
    svg += `  <rect width="100%" height="100%" fill="${theme.bg}" rx="8"/>\n`;
  }

  TROPHY_DEFS.forEach((trophy, i) => {
    const col = i % column;
    const row = Math.floor(i / column);
    const x = col * (trophySize + marginW);
    const y = row * (trophySize + marginH);
    svg += renderTrophy(trophy, stats, theme, x, y, trophySize, noFrame, noBg);
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
    const noFrame = getInput('no_frame') !== 'false';
    const noBg = getInput('no_bg') !== 'false';
    const column = parseInt(getInput('column') || '4', 10);
    const marginW = parseInt(getInput('margin_w') || '15', 10);
    const marginH = parseInt(getInput('margin_h') || '15', 10);

    const userNames = userNamesInput.split(/[,\n]/).map(u => u.trim()).filter(u => u.length > 0);
    const tokens = tokensInput.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);

    if (tokens.length === 1) {
      while (tokens.length < userNames.length) tokens.push(tokens[0]);
    } else if (tokens.length !== userNames.length) {
      throw new Error(`Mismatch: ${userNames.length} usernames but ${tokens.length} tokens`);
    }

    const theme = THEMES[themeName] || THEMES['darkhub'];

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
    const svg = generateTrophiesSvg(mergedStats, { theme, noFrame, noBg, column, marginW, marginH });

    const dir = path.dirname(output);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output, svg);

    console.log('\n✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
