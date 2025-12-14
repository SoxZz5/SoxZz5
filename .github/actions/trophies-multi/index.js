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

// Themes - A ranks are gold/yellow tones (not silver)
const THEMES = {
  darkhub: {
    background: '#24292e',
    border: '#3d3d3d',
    title: '#ffffff',
    text: '#9e9e9e',
    icon: '#3d3d3d',
    rankS: { bg: '#ffd700', text: '#000' },  // Bright gold
    rankA: { bg: '#f0c14b', text: '#000' },  // Yellow gold (was silver)
    rankB: { bg: '#cd7f32', text: '#fff' },  // Bronze
    rankC: { bg: '#555', text: '#fff' },     // Gray
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

// Professional trophy SVG with different designs per rank level
function renderTrophy(trophy, stats, theme, x, y, size) {
  const value = stats[trophy.key];
  const rank = getRank(value, trophy.thresholds);
  const rankStyle = getRankStyle(rank, theme);
  const isS = rank.startsWith('S');
  const isA = rank.startsWith('A');
  const isB = rank === 'B';

  const cx = size / 2;
  const gradId = `grad_${x}_${y}`;
  const shineId = `shine_${x}_${y}`;

  let svg = `<g transform="translate(${x}, ${y})">`;

  // Background with subtle gradient - A ranks use gold tones
  svg += `
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${rankStyle.bg}"/>
        <stop offset="50%" stop-color="${rankStyle.bg}"/>
        <stop offset="100%" stop-color="${isS ? '#b8860b' : isA ? '#c9a227' : isB ? '#8b4513' : '#333'}"/>
      </linearGradient>
      <linearGradient id="${shineId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="white" stop-opacity="0.4"/>
        <stop offset="50%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <filter id="shadow_${x}_${y}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>`;

  // Card background - A ranks have gold border
  svg += `<rect width="${size}" height="${size}" rx="8" fill="${theme.background}" stroke="${isS ? '#ffd700' : isA ? '#f0c14b' : theme.border}" stroke-width="${isS || isA ? 2 : 1}"/>`;

  // Decorative corners for S rank
  if (isS) {
    svg += `<path d="M0,15 L0,8 Q0,0 8,0 L15,0" fill="none" stroke="#ffd700" stroke-width="2"/>`;
    svg += `<path d="M${size-15},0 L${size-8},0 Q${size},0 ${size},8 L${size},15" fill="none" stroke="#ffd700" stroke-width="2"/>`;
    svg += `<path d="M${size},${size-15} L${size},${size-8} Q${size},${size} ${size-8},${size} L${size-15},${size}" fill="none" stroke="#ffd700" stroke-width="2"/>`;
    svg += `<path d="M15,${size} L8,${size} Q0,${size} 0,${size-8} L0,${size-15}" fill="none" stroke="#ffd700" stroke-width="2"/>`;
  }

  const trophyY = 15;

  if (isS) {
    // Grand trophy for S ranks - ornate cup with handles and star
    svg += `<g transform="translate(${cx}, ${trophyY})" filter="url(#shadow_${x}_${y})">
      <!-- Main cup body -->
      <path d="M-20,5 L-18,0 L18,0 L20,5 L17,30 L-17,30 Z" fill="url(#${gradId})"/>
      <!-- Cup rim -->
      <ellipse cx="0" cy="2" rx="20" ry="5" fill="url(#${gradId})"/>
      <ellipse cx="0" cy="2" rx="18" ry="4" fill="url(#${shineId})"/>
      <!-- Handles -->
      <path d="M-18,8 C-30,8 -30,25 -17,25" fill="none" stroke="url(#${gradId})" stroke-width="4"/>
      <path d="M18,8 C30,8 30,25 17,25" fill="none" stroke="url(#${gradId})" stroke-width="4"/>
      <!-- Stem -->
      <rect x="-5" y="30" width="10" height="8" fill="url(#${gradId})"/>
      <!-- Base -->
      <path d="M-18,38 L18,38 L15,45 L-15,45 Z" fill="url(#${gradId})"/>
      <rect x="-18" y="45" width="36" height="4" rx="1" fill="url(#${gradId})"/>
      <!-- Star on cup -->
      <polygon points="0,10 3,18 11,18 5,23 7,31 0,27 -7,31 -5,23 -11,18 -3,18" fill="${rankStyle.text}" transform="scale(0.5) translate(0, 5)"/>
    </g>`;
  } else if (isA) {
    // Elegant trophy for A ranks - sleek design
    svg += `<g transform="translate(${cx}, ${trophyY})" filter="url(#shadow_${x}_${y})">
      <!-- Cup body -->
      <path d="M-15,5 L-13,0 L13,0 L15,5 L12,28 L-12,28 Z" fill="url(#${gradId})"/>
      <!-- Cup rim -->
      <ellipse cx="0" cy="2" rx="15" ry="4" fill="url(#${gradId})"/>
      <ellipse cx="0" cy="2" rx="13" ry="3" fill="url(#${shineId})"/>
      <!-- Handles -->
      <path d="M-13,7 C-22,7 -22,22 -12,22" fill="none" stroke="url(#${gradId})" stroke-width="3"/>
      <path d="M13,7 C22,7 22,22 12,22" fill="none" stroke="url(#${gradId})" stroke-width="3"/>
      <!-- Stem -->
      <rect x="-4" y="28" width="8" height="7" fill="url(#${gradId})"/>
      <!-- Base -->
      <rect x="-14" y="35" width="28" height="3" rx="1" fill="url(#${gradId})"/>
      <rect x="-12" y="38" width="24" height="5" rx="1" fill="url(#${gradId})"/>
    </g>`;
  } else if (isB) {
    // Simple trophy for B rank - classic cup
    svg += `<g transform="translate(${cx}, ${trophyY + 3})" filter="url(#shadow_${x}_${y})">
      <!-- Cup body -->
      <path d="M-12,3 L-10,0 L10,0 L12,3 L10,25 L-10,25 Z" fill="url(#${gradId})"/>
      <!-- Cup rim -->
      <ellipse cx="0" cy="1" rx="12" ry="3" fill="url(#${gradId})"/>
      <!-- Handles -->
      <path d="M-10,5 C-18,5 -18,18 -10,18" fill="none" stroke="url(#${gradId})" stroke-width="2.5"/>
      <path d="M10,5 C18,5 18,18 10,18" fill="none" stroke="url(#${gradId})" stroke-width="2.5"/>
      <!-- Stem -->
      <rect x="-3" y="25" width="6" height="6" fill="url(#${gradId})"/>
      <!-- Base -->
      <rect x="-10" y="31" width="20" height="4" rx="1" fill="url(#${gradId})"/>
    </g>`;
  } else {
    // Basic medal for C rank
    svg += `<g transform="translate(${cx}, ${trophyY + 8})" filter="url(#shadow_${x}_${y})">
      <!-- Ribbon -->
      <path d="M-8,-5 L-5,15 L0,10 L5,15 L8,-5" fill="${rankStyle.bg}"/>
      <!-- Medal circle -->
      <circle cx="0" cy="22" r="16" fill="url(#${gradId})" stroke="${theme.border}" stroke-width="2"/>
      <circle cx="0" cy="22" r="12" fill="${theme.background}" stroke="${rankStyle.bg}" stroke-width="1"/>
    </g>`;
  }

  // Rank badge - text moved up for better centering
  const badgeY = isS ? 70 : isA ? 65 : isB ? 62 : 60;
  svg += `<circle cx="${cx}" cy="${badgeY}" r="12" fill="${rankStyle.bg}"/>`;
  svg += `<text x="${cx}" y="${badgeY - 3}" fill="${rankStyle.text}" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="central">${rank}</text>`;

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
