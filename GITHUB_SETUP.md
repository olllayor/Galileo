# GitHub Publication Checklist

✅ **Already completed:**

- [x] LICENSE file (MIT)
- [x] README.md with setup instructions
- [x] CONTRIBUTING.md with development guidelines
- [x] Pull Request template (.github/pull_request_template.md)
- [x] Issue templates (.github/ISSUE_TEMPLATE/)
- [x] .gitignore properly configured
- [x] package.json with metadata
- [x] TypeScript configuration

**Before publishing to GitHub:**

- [ ] Update `package.json` with your details:
  ```json
  {
    "name": "galileo",
    "description": "Cursor for Designers - Figma-like AI-powered design tool",
    "repository": {
      "type": "git",
      "url": "https://github.com/yourusername/galileo.git"
    },
    "author": "Your Name",
    "license": "MIT"
  }
  ```

- [ ] Update README.md placeholders:
  - Replace `yourusername` with your GitHub username
  - Update repository URL in Quick Start section

- [ ] Update CONTRIBUTING.md:
  - Verify setup instructions match your environment
  - Update any custom contribution guidelines

- [ ] Create GitHub repository:
  1. Go to https://github.com/new
  2. Repository name: `galileo`
  3. Add description: "Cursor for Designers - Figma-like AI-powered design tool"
  4. Choose Public or Private
  5. Do NOT initialize with README (we have one)
  6. Click "Create repository"

- [ ] Initialize and push to GitHub:
  ```bash
  cd /Users/ollayor/Code/Projects/Galileo
  git config user.name "Your Name"
  git config user.email "your.email@example.com"
  git add .
  git commit -m "chore: initial commit"
  git branch -M main
  git remote add origin https://github.com/yourusername/galileo.git
  git push -u origin main
  ```

- [ ] After push, configure repository:
  1. Go to Settings → General
  2. Set default branch to `main`
  3. Enable "Discussions" if desired
  4. Configure branch protection if needed

- [ ] Add repository topics:
  On repository page, add these topics:
  - `design-tool`
  - `tauri`
  - `react`
  - `typescript`
  - `rust`
  - `ai`
  - `figma-alternative`

## Optional Enhancements

- [ ] Add GitHub Actions workflows (CI/CD)
- [ ] Add code coverage reporting
- [ ] Add security policy (SECURITY.md)
- [ ] Create code of conduct (CODE_OF_CONDUCT.md)
- [ ] Set up releases/versioning with tags
- [ ] Add badges to README (build status, downloads, etc.)

## Resources

- [GitHub Docs: Setting up repositories](https://docs.github.com/en/repositories)
- [GitHub Docs: Adding a license](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
- [GitHub Docs: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
