# Plain English – Practice Hub

Personal English study platform hosted on GitHub Pages.  
Every week, add 5 episode PDFs + your vocabulary notes, run one command, and the site is updated automatically.

---

## One-time setup

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Create a GitHub repository

1. Go to [github.com/new](https://github.com/new) and create a new **public** repository (e.g. `learn-english`).
2. Inside this folder, run:
   ```bash
   git init
   git remote add origin https://github.com/YOUR_USER/learn-english.git
   git add .
   git commit -m "chore: initial setup"
   git push -u origin main
   ```

### 3. Enable GitHub Pages

On GitHub → Settings → Pages → Source: **Deploy from a branch** → Branch: `main` → Folder: `/docs`.

Your site will be at: `https://YOUR_USER.github.io/learn-english/`

---

## Weekly workflow

### Step 1 – Prepare the module folder

```
modules/
└── module-02/          ← create a new numbered folder each week
    ├── pdfs/
    │   ├── episode-06.pdf
    │   ├── episode-07.pdf
    │   ├── episode-08.pdf
    │   ├── episode-09.pdf
    │   └── episode-10.pdf
    └── vocab.xlsx      ← copy from modules/module-01/vocab.xlsx and fill in your words
```

### Step 2 – Fill in `vocab.xlsx`

| Column | What to write |
|--------|--------------|
| A – Word / Expression | The word or phrase (e.g. `come across`) |
| B – Example Sentence  | The sentence where you heard it (optional) |
| C – My Notes          | Your own explanation / translation |
| D – Episode           | e.g. `Episode 06` |

### Step 3 – Run the script

```bash
# Processes the latest module folder and pushes to GitHub:
python generate_module.py

# Or specify a module number:
python generate_module.py --module 2

# Regenerate everything without pushing:
python generate_module.py --all --no-push
```

That's it! GitHub Pages updates within ~2 minutes.

---

## Project structure

```
learn-english/
├── generate_module.py   ← Weekly script
├── requirements.txt
├── modules/
│   └── module-01/
│       ├── pdfs/        ← Put the 5 episode PDFs here
│       └── vocab.xlsx   ← Your vocabulary notes
└── docs/                ← GitHub Pages root
    ├── index.html       ← Module list
    ├── play.html        ← Game interface
    ├── css/style.css
    ├── js/
    │   ├── app.js
    │   └── games.js
    └── data/
        ├── modules.json        ← Auto-generated index
        └── module-01.json      ← Auto-generated module data
```

## Activity types

| Game | What it tests |
|------|--------------|
| 🃏 Flashcards      | Vocabulary recall |
| ✏️ Fill Blanks     | Word in context |
| 🔘 Quiz            | Definition recognition |
| 🔗 Matching        | Word ↔ definition pairs |
| 🔀 Sentence Order  | Grammar & natural word order |
