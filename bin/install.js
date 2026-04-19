#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

const banner = `
${cyan}  ██████╗  █████╗ ██╗   ██╗██╗
  ██╔══██╗██╔══██╗██║   ██║██║
  ██████╔╝███████║██║   ██║██║
  ██╔═══╝ ██╔══██║██║   ██║██║
  ██║     ██║  ██║╚██████╔╝███████╗
  ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝${reset}

  PAUL Framework ${dim}v${pkg.version}${reset}
  Plan-Apply-Unify Loop for Claude Code and Codex CLI
`;

// Target CLI configurations
const TARGETS = {
  claude: {
    envVar: 'CLAUDE_CONFIG_DIR',
    defaultDir: '.claude',
    localDir: '.claude',
    label: 'Claude Code',
    commandsLabel: 'commands/paul',
    frameworkLabel: 'paul-framework',
    getCommandsDest: (rootDir) => path.join(rootDir, 'commands', 'paul'),
    getFrameworkDest: (rootDir) => path.join(rootDir, 'paul-framework'),
    getSkillRoot: () => null,
    getPathPrefix: ({ isGlobal, hasCustomConfigDir, resolvedDir }) => (
      isGlobal
        ? (hasCustomConfigDir ? `${resolvedDir}/` : '~/.claude/')
        : './.claude/'
    )
  },
  codex: {
    envVar: 'CODEX_HOME',
    defaultDir: '.codex',
    localDir: '.agents',
    label: 'Codex CLI',
    commandsLabel: 'skills/paul/commands',
    frameworkLabel: 'skills/paul/paul-framework',
    getCommandsDest: (rootDir) => path.join(rootDir, 'skills', 'paul', 'commands'),
    getFrameworkDest: (rootDir) => path.join(rootDir, 'skills', 'paul', 'paul-framework'),
    getSkillRoot: (rootDir) => path.join(rootDir, 'skills', 'paul'),
    getPathPrefix: ({ isGlobal, hasCustomConfigDir, resolvedDir }) => {
      if (!isGlobal) return './.agents/skills/paul/';
      if (hasCustomConfigDir) return `${resolvedDir}/skills/paul/`;
      return '~/.codex/skills/paul/';
    }
  }
};

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasHelp = args.includes('--help') || args.includes('-h');

// Parse --flag value or --flag=value style arguments
function parseOptionArg(longFlag, shortFlag) {
  const optionIndex = args.findIndex(arg => arg === longFlag || arg === shortFlag);
  if (optionIndex !== -1) {
    const nextArg = args[optionIndex + 1];
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}${longFlag} requires an argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }

  const optionArg = args.find(arg => arg.startsWith(`${longFlag}=`) || arg.startsWith(`${shortFlag}=`));
  if (optionArg) {
    const value = optionArg.slice(optionArg.indexOf('=') + 1);
    if (!value) {
      console.error(`  ${yellow}${longFlag} requires an argument${reset}`);
      process.exit(1);
    }
    return value;
  }

  return null;
}

// Parse --config-dir argument
function parseConfigDirArg() {
  return parseOptionArg('--config-dir', '-c');
}

// Parse --target argument
function parseTargetArg() {
  const target = parseOptionArg('--target', '-t');
  if (!target) return null;
  const normalized = target.toLowerCase();
  if (!TARGETS[normalized]) {
    console.error(`  ${yellow}Invalid target "${target}". Use "claude" or "codex"${reset}`);
    process.exit(1);
  }
  return normalized;
}

const explicitConfigDir = parseConfigDirArg();
const explicitTarget = parseTargetArg();
const defaultTarget = explicitTarget || 'claude';

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx paul-framework [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}                Install globally (to config directory)
    ${cyan}-l, --local${reset}                 Install locally (to current project)
    ${cyan}-t, --target <claude|codex>${reset} Target CLI (default: claude)
    ${cyan}-c, --config-dir <path>${reset}     Specify custom config directory
    ${cyan}-h, --help${reset}                  Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install for Claude Code globally${reset}
    npx paul-framework --global

    ${dim}# Install for Codex CLI globally${reset}
    npx paul-framework --target codex --global

    ${dim}# Install to custom config directory${reset}
    npx paul-framework --global --config-dir ~/.claude-custom

    ${dim}# Install to current project only${reset}
    npx paul-framework --local

    ${dim}# Install for Codex in current project${reset}
    npx paul-framework --target codex --local

  ${yellow}What gets installed:${reset}
    ${dim}Claude Code (--target claude):${reset}
      commands/paul/        Slash commands (/paul:init, /paul:plan, etc.)
      paul-framework/       Templates, workflows, references, rules
    ${dim}Codex CLI (--target codex):${reset}
      ~/.codex/skills/paul/   Codex skill with SKILL.md, commands, framework
      .agents/skills/paul/    Same layout, scoped to current repo
`);
  process.exit(0);
}

/**
 * Expand ~ to home directory
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Recursively copy directory, replacing paths in .md files
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
    } else if (entry.name.endsWith('.md')) {
      // Replace ~/.claude/ with the appropriate prefix in markdown files
      let content = fs.readFileSync(srcPath, 'utf8');
      content = content.replace(/~\/\.claude\//g, pathPrefix);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Extract top-level frontmatter field value from markdown content
 */
function extractFrontmatterField(content, fieldName) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;

  const lines = frontmatterMatch[1].split(/\r?\n/);
  for (const line of lines) {
    if (/^\s+/.test(line)) continue; // skip nested YAML

    const fieldMatch = line.match(new RegExp(`^${fieldName}:\\s*(.+)$`));
    if (!fieldMatch) continue;

    return fieldMatch[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');
  }

  return null;
}

/**
 * Extract first meaningful line from <objective>...</objective> block
 */
function extractObjectiveSummary(content) {
  const objectiveMatch = content.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
  if (!objectiveMatch) return null;

  const lines = objectiveMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('**When to use:**')) continue;
    return trimmed.replace(/\*\*/g, '').replace(/`/g, '');
  }

  return null;
}

/**
 * Build SKILL.md content for Codex installs
 */
function generateCodexSkillMarkdown(commandsSrcDir) {
  const commandFiles = fs.readdirSync(commandsSrcDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort();

  const commandLines = commandFiles.map((fileName) => {
    const commandContent = fs.readFileSync(path.join(commandsSrcDir, fileName), 'utf8');
    const description = extractFrontmatterField(commandContent, 'description')
      || extractObjectiveSummary(commandContent)
      || 'See command workflow documentation.';
    const commandName = path.basename(fileName, '.md');
    return `- \`${commandName}\` - ${description} Use paul skill command \`${fileName}\` and follow its workflow.`;
  });

  return `---
name: "paul"
description: "Use when the task involves structured project planning, phased execution, or reconciliation of plan vs. actual work. Provides PLAN, APPLY, and UNIFY workflow commands for AI-assisted development."
---

# PAUL Framework

PAUL is a structured development framework with ${commandFiles.length} workflow commands. Since Codex does not have slash commands, invoke PAUL workflows by asking the model to read and follow the relevant command file from this skill's commands/ directory.

## Available commands

${commandLines.join('\n')}

## Quick start

1. "Use paul skill command init.md and follow its workflow"
2. "Use paul skill command plan.md and follow its workflow"
3. "Use paul skill command apply.md and follow its workflow"
4. "Use paul skill command unify.md and follow its workflow"
`;
}

/**
 * Install to the specified directory
 */
function install(isGlobal, target) {
  const targetConfig = TARGETS[target];
  const src = path.join(__dirname, '..');
  const resolvedConfigDir = expandTilde(explicitConfigDir) || expandTilde(process.env[targetConfig.envVar]);
  const defaultGlobalDir = resolvedConfigDir || path.join(os.homedir(), targetConfig.defaultDir);
  const configRootDir = isGlobal
    ? defaultGlobalDir
    : path.join(process.cwd(), targetConfig.localDir);

  const locationLabel = isGlobal
    ? configRootDir.replace(os.homedir(), '~')
    : configRootDir.replace(process.cwd(), '.');

  // Path prefix for file references
  const pathPrefix = targetConfig.getPathPrefix({
    isGlobal,
    hasCustomConfigDir: Boolean(resolvedConfigDir),
    resolvedDir: configRootDir
  });

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);

  // Copy src/commands into target command destination
  const commandsSrc = path.join(src, 'src', 'commands');
  const commandsDest = targetConfig.getCommandsDest(configRootDir);
  copyWithPathReplacement(commandsSrc, commandsDest, pathPrefix);
  console.log(`  ${green}✓${reset} Installed ${targetConfig.commandsLabel}`);

  // Copy src/* directories (except commands) to framework destination
  const frameworkDest = targetConfig.getFrameworkDest(configRootDir);
  fs.mkdirSync(frameworkDest, { recursive: true });

  const srcDirs = ['templates', 'workflows', 'references', 'rules'];
  for (const dir of srcDirs) {
    const dirSrc = path.join(src, 'src', dir);
    const dirDest = path.join(frameworkDest, dir);
    if (fs.existsSync(dirSrc)) {
      copyWithPathReplacement(dirSrc, dirDest, pathPrefix);
    }
  }
  console.log(`  ${green}✓${reset} Installed ${targetConfig.frameworkLabel}`);

  // Generate SKILL.md for Codex
  if (target === 'codex') {
    const skillRoot = targetConfig.getSkillRoot(configRootDir);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      generateCodexSkillMarkdown(commandsSrc)
    );
    console.log(`  ${green}✓${reset} Installed skills/paul/SKILL.md`);
  }

  const successMessage = target === 'codex'
    ? `Launch Codex and ask: ${cyan}"Use paul skill command help.md and follow its workflow"${reset}.`
    : `Launch Claude Code and run ${cyan}/paul:help${reset}.`;

  console.log(`
  ${green}Done!${reset} ${successMessage}
`);
}

/**
 * Resolve global/local path labels for interactive prompts
 */
function getLocationLabels(target) {
  const targetConfig = TARGETS[target];
  const configDir = expandTilde(explicitConfigDir) || expandTilde(process.env[targetConfig.envVar]);
  const globalPath = configDir || path.join(os.homedir(), targetConfig.defaultDir);
  return {
    globalLabel: globalPath.replace(os.homedir(), '~'),
    localLabel: `./${targetConfig.localDir}`
  };
}

/**
 * Prompt for install location
 */
function promptLocation(target) {
  const targetConfig = TARGETS[target];
  let answered = false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.on('close', () => { if (!answered) process.exit(0); });

  const { globalLabel, localLabel } = getLocationLabels(target);

  console.log(`  ${yellow}Where would you like to install for ${targetConfig.label}?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalLabel})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(${localLabel})${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    install(isGlobal, target);
  });
}

/**
 * Prompt for target and then install location
 */
function promptTargetThenLocation() {
  let answered = false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.on('close', () => { if (!answered) process.exit(0); });

  console.log(`  ${yellow}Which CLI should PAUL install for?${reset}

  ${cyan}1${reset}) Claude Code
  ${cyan}2${reset}) Codex CLI
`);

  rl.question(`  Target ${dim}[1]${reset}: `, (targetAnswer) => {
    const targetChoice = targetAnswer.trim().toLowerCase();
    const target = ['2', 'codex'].includes(targetChoice) ? 'codex' : 'claude';
    const { globalLabel, localLabel } = getLocationLabels(target);

    console.log(`
  ${yellow}Where would you like to install for ${TARGETS[target].label}?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalLabel})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(${localLabel})${reset} - this project only
`);

    rl.question(`  Choice ${dim}[1]${reset}: `, (locationAnswer) => {
      answered = true;
      rl.close();
      const choice = locationAnswer.trim() || '1';
      const isGlobal = choice !== '2';
      install(isGlobal, target);
    });
  });
}

// Main
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${yellow}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  install(true, defaultTarget);
} else if (hasLocal) {
  install(false, defaultTarget);
} else if (explicitTarget) {
  promptLocation(defaultTarget);
} else {
  promptTargetThenLocation();
}
