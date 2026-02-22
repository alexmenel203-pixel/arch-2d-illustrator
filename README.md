# Arch 2D Illustrator

A 2D illustration tool for architectural drawings and diagrams.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Tech Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling

## From photo

In the editor, use **From photo** → **Choose image** (side-view photo, plain background) → **Extract profile**. The app uses simple computer vision (grayscale, Otsu threshold, silhouette edge) to get a profile curve and fills the **Profile** points. Adjust them and add decoration/handles as needed.

## Project Structure

```
src/
  ├── App.tsx           # Main application component
  ├── editor/           # Find editor (profile, bands, handles, from-photo)
  ├── illustration/     # SVG rendering (FindIllustration, patterns)
  ├── types/            # FindIllustrationSpec, ProfilePoint, etc.
  ├── data/             # Sample finds, default spec
  ├── utils/             # Export, import, photoToProfile
  └── ...
```
