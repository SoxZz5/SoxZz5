const fs = require('fs');
const path = require('path');

// Simple action helpers
function getInput(name, required = false) {
  const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
  if (required && !val) throw new Error(`Input required: ${name}`);
  return val;
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

// Themes
const THEMES = {
  'darkhub': {
    bg: '#24292f', title: '#FFFFFF', text: '#A0A0A0', icon: '#3D3D3D',
    sBase: '#FFD700', sText: '#000', aBase: '#C0C0C0', aText: '#000',
    bBase: '#CD7F32', bText: '#FFF', defBase: '#4A4A4A', defText: '#FFF',
    laurel: '#FFD700', bar: '#3D3D3D'
  },
  'onedark': {
    bg: '#282C34', title: '#E5C07B', text: '#ABB2BF', icon: '#3D3D3D',
    sBase: '#E5C07B', sText: '#282C34', aBase: '#98C379', aText: '#282C34',
    bBase: '#61AFEF', bText: '#282C34', defBase: '#4B5263', defText: '#ABB2BF',
    laurel: '#E5C07B', bar: '#3D3D3D'
  },
  'gruvbox': {
    bg: '#282828', title: '#FABD2F', text: '#EBDBB2', icon: '#3C3836',
    sBase: '#FABD2F', sText: '#282828', aBase: '#B8BB26', aText: '#282828',
    bBase: '#FE8019', bText: '#282828', defBase: '#504945', defText: '#EBDBB2',
    laurel: '#FABD2F', bar: '#3C3836'
  },
  'dracula': {
    bg: '#282A36', title: '#F8F8F2', text: '#6272A4', icon: '#44475A',
    sBase: '#FFB86C', sText: '#282A36', aBase: '#50FA7B', aText: '#282A36',
    bBase: '#FF79C6', bText: '#282A36', defBase: '#44475A', defText: '#F8F8F2',
    laurel: '#FFB86C', bar: '#44475A'
  },
  'monokai': {
    bg: '#272822', title: '#F8F8F2', text: '#75715E', icon: '#3E3D32',
    sBase: '#E6DB74', sText: '#272822', aBase: '#A6E22E', aText: '#272822',
    bBase: '#FD971F', bText: '#272822', defBase: '#49483E', defText: '#F8F8F2',
    laurel: '#E6DB74', bar: '#3E3D32'
  },
  'nord': {
    bg: '#2E3440', title: '#ECEFF4', text: '#D8DEE9', icon: '#3B4252',
    sBase: '#EBCB8B', sText: '#2E3440', aBase: '#A3BE8C', aText: '#2E3440',
    bBase: '#D08770', bText: '#2E3440', defBase: '#4C566A', defText: '#ECEFF4',
    laurel: '#EBCB8B', bar: '#3B4252'
  },
  'tokyonight': {
    bg: '#1A1B26', title: '#C0CAF5', text: '#565F89', icon: '#24283B',
    sBase: '#E0AF68', sText: '#1A1B26', aBase: '#9ECE6A', aText: '#1A1B26',
    bBase: '#F7768E', bText: '#1A1B26', defBase: '#414868', defText: '#C0CAF5',
    laurel: '#E0AF68', bar: '#24283B'
  },
  'radical': {
    bg: '#141321', title: '#FE428E', text: '#A9FEF7', icon: '#1D1B2E',
    sBase: '#FE428E', sText: '#141321', aBase: '#F8D847', aText: '#141321',
    bBase: '#A9FEF7', bText: '#141321', defBase: '#2D2B40', defText: '#A9FEF7',
    laurel: '#FE428E', bar: '#1D1B2E'
  }
};

// Trophy definitions with rank thresholds
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

// GraphQL query for user stats
const STATS_QUERY = `
query($login: String!) {
  user(login: $login) {
    name
    login
    createdAt
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
      }
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch stats for ${username}: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL error for ${username}: ${JSON.stringify(data.errors)}`);
  }
  if (!data.data?.user) {
    throw new Error(`User ${username} not found`);
  }

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

  console.log(`  ${username}: ${stats.totalCommits} commits, ${stats.totalStars} stars, ${stats.totalFollowers} followers`);
  return stats;
}

function mergeStats(allStats) {
  console.log('Merging stats from all users...');

  const merged = {
    totalStars: 0,
    totalCommits: 0,
    totalFollowers: 0,
    totalRepos: 0,
    totalPRs: 0,
    totalIssues: 0,
    totalReviews: 0,
    accountYears: 0
  };

  for (const stats of allStats) {
    merged.totalStars += stats.totalStars;
    merged.totalCommits += stats.totalCommits;
    merged.totalFollowers += stats.totalFollowers;
    merged.totalRepos += stats.totalRepos;
    merged.totalPRs += stats.totalPRs;
    merged.totalIssues += stats.totalIssues;
    merged.totalReviews += stats.totalReviews;
    merged.accountYears = Math.max(merged.accountYears, stats.accountYears);
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

function getRankColors(rank, theme) {
  if (rank.startsWith('S')) return { base: theme.sBase, text: theme.sText };
  if (rank.startsWith('A')) return { base: theme.aBase, text: theme.aText };
  if (rank === 'B') return { base: theme.bBase, text: theme.bText };
  return { base: theme.defBase, text: theme.defText };
}

function formatValue(value) {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
  return value.toString();
}

function renderTrophy(trophy, stats, theme, x, y, size, noFrame, noBg) {
  const value = stats[trophy.key];
  const rank = getRank(value, trophy.thresholds);
  const colors = getRankColors(rank, theme);

  const padding = 10;
  const iconSize = 40;
  const innerWidth = size - padding * 2;

  let svg = `<g transform="translate(${x}, ${y})">`;

  // Background
  if (!noBg) {
    svg += `<rect width="${size}" height="${size}" rx="6" fill="${theme.bg}"/>`;
  }

  // Frame
  if (!noFrame) {
    svg += `<rect width="${size}" height="${size}" rx="6" fill="none" stroke="${theme.icon}" stroke-width="1"/>`;
  }

  // Trophy icon circle
  const cx = size / 2;
  const cy = 35;
  svg += `<circle cx="${cx}" cy="${cy}" r="${iconSize / 2}" fill="${colors.base}"/>`;

  // Rank letter
  const rankDisplay = rank.length > 2 ? rank.slice(0, 2) : rank;
  const fontSize = rank.length > 1 ? 14 : 18;
  svg += `<text x="${cx}" y="${cy + 5}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">${rankDisplay}</text>`;

  // Trophy title
  svg += `<text x="${cx}" y="${size - 28}" fill="${theme.title}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="600" text-anchor="middle">${trophy.title}</text>`;

  // Value
  svg += `<text x="${cx}" y="${size - 12}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="10" text-anchor="middle">${formatValue(value)}</text>`;

  svg += '</g>';
  return svg;
}

function generateTrophiesSvg(stats, options) {
  const { theme, noFrame, noBg, column, marginW, marginH } = options;
  const trophySize = 110;

  const rows = Math.ceil(TROPHY_DEFS.length / column);
  const width = column * trophySize + (column - 1) * marginW;
  const height = rows * trophySize + (rows - 1) * marginH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

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

    // Expand single token to all users
    if (tokens.length === 1) {
      while (tokens.length < userNames.length) tokens.push(tokens[0]);
    } else if (tokens.length !== userNames.length) {
      throw new Error(`Mismatch: ${userNames.length} usernames but ${tokens.length} tokens`);
    }

    const theme = THEMES[themeName] || THEMES['darkhub'];

    console.log(`\n🏆 Multi-User Trophy Generator`);
    console.log(`   Users: ${userNames.join(', ')}`);
    console.log(`   Theme: ${themeName}\n`);

    // Fetch stats for all users
    const allStats = await Promise.all(
      userNames.map((username, i) => fetchUserStats(username, tokens[i]))
    );

    // Merge stats
    const mergedStats = mergeStats(allStats);
    console.log(`\n📊 Merged stats:`);
    console.log(`   Commits: ${mergedStats.totalCommits}`);
    console.log(`   Stars: ${mergedStats.totalStars}`);
    console.log(`   Followers: ${mergedStats.totalFollowers}`);
    console.log(`   Repos: ${mergedStats.totalRepos}`);
    console.log(`   PRs: ${mergedStats.totalPRs}`);
    console.log(`   Experience: ${mergedStats.accountYears} years\n`);

    // Generate SVG
    console.log(`Generating ${output}...`);
    const svg = generateTrophiesSvg(mergedStats, { theme, noFrame, noBg, column, marginW, marginH });

    // Write file
    const dir = path.dirname(output);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(output, svg);

    console.log('\n✅ Done!');
  } catch (error) {
    setFailed(error.message);
  }
}

run();
