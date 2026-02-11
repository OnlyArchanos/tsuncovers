# Tsun — Manga Cover Archive & Grid Builder

A web application for browsing manga covers and creating 3×3 grids. Built with vanilla JavaScript, no frameworks—just the DOM, some CSS custom properties, and a tsundere attitude.

---

## Architecture Overview

The application consists of three main components:

**Frontend (Static Pages)**
- `index.html` — Cover gallery with search, genre carousels, and lightbox
- `builder.html` — Grid editor for creating and managing 3×3 layouts

**Backend (Node.js + Express)**
- `server.js` — Authentication, database operations, and image proxying

**Data Layer**
- MongoDB — User grids storage
- LocalStorage — Client-side caching and optimistic updates
- MangaDex API — Manga metadata and cover images

---

## How It Works

### Search & Autocomplete

The search system uses a debounced input handler that queries MangaDex's manga endpoint. When you type, it waits 380ms before firing a request—enough to avoid hammering the API with every keystroke, but fast enough to feel responsive.

```javascript
searchInput.addEventListener('input', () => {
  clearTimeout(state.searchTimeout);
  const query = searchInput.value.trim();
  if (query.length < 2) return;
  state.searchTimeout = setTimeout(() => fetchSuggestions(query), 380);
});
```

The API returns manga objects with multilingual titles stored as `{ en: "...", ja: "...", "ja-ro": "..." }`. We prioritize English titles, falling back to romanized Japanese, then native Japanese, then whatever's available. Cover images come from a relationship array—we filter for `type: 'cover_art'` and extract the filename, then construct URLs pointing to MangaDex's CDN.

### Cover Fetching

Once you select a manga, the app fetches all available covers through the `/cover` endpoint. MangaDex returns an array of cover art objects, each with volume information and filenames. We map these to a consistent structure:

```javascript
const covers = data.data.map((cover, i) => ({
  url: `https://uploads.mangadex.org/covers/${mangaId}/${cover.attributes.fileName}`,
  volume: cover.attributes.volume || cover.attributes.description || `Cover ${i + 1}`
}));
```

The gallery uses pagination—10 covers per page—with lazy loading via the browser's native `loading="lazy"` attribute. Clicking a cover opens a lightbox; selecting multiple covers (via checkbox mode) lets you build a grid directly.

### Genre Carousels

Genre carousels use MangaDex's tag-based filtering system. Each genre maps to a UUID:

```javascript
const MANGADEX_TAGS = {
  'Action': '391b0423-d847-456f-aff0-8b0cfc03066b',
  'Romance': '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  // ...
};
```

The loading strategy is progressive: fetch 3 manga immediately to populate the carousel, then fetch 25 after a 600ms delay. This creates perceived performance—users see content instantly while the full dataset loads in the background.

Results are cached in localStorage with a 24-hour TTL. The cache key includes a version number (`tsun_cache_v2_${genre}`) to invalidate old data after API migrations.

### Grid Builder

The grid is a state array of 9 slots, each containing `{ id, title, image }` or `null`. Clicking an empty slot triggers the search flow; clicking a filled slot opens the cover picker, which lets you swap to a different cover for that manga.

State persists to localStorage on every change:

```javascript
function saveCurrentGrid() {
  localStorage.setItem('tsun_current_grid', JSON.stringify(currentGrid));
}
```

When you save a grid, it's added to the saved grids array with a timestamp and unique ID. If you're logged in, it syncs to MongoDB via the backend API.

### Canvas Rendering

Grids are rendered to canvas for download. The process:

1. Create a 604×906px canvas (3 columns × 3 rows at 200×300px each, plus 2px gaps)
2. Load all images via `new Image()` with crossOrigin set to 'anonymous'
3. Use the backend proxy (`/api/proxy?url=...`) if images are hosted on external domains to avoid CORS issues
4. Draw each image with center-crop scaling:

```javascript
const scale = Math.max(cellWidth / img.naturalWidth, cellHeight / img.naturalHeight);
const sourceWidth = cellWidth / scale;
const sourceHeight = cellHeight / scale;
const sourceX = (img.naturalWidth - sourceWidth) / 2;
const sourceY = (img.naturalHeight - sourceHeight) / 2;
ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, x, y, cellWidth, cellHeight);
```

This ensures covers fill their cells completely, cropping to fit the 2:3 aspect ratio.

### Authentication & Sync

Google OAuth is handled client-side using the Google Identity Services library. When you sign in:

1. User clicks "Sign In" → Google popup opens
2. On success, receive a JWT credential
3. Send it to the backend for verification
4. Backend validates with Google, extracts user info, generates a session token
5. Client stores `{ token, name, picture }` in localStorage

Syncing works through optimistic updates. When you save a grid:

1. Add to local state immediately
2. Update localStorage
3. Send to backend asynchronously
4. If successful, update the grid's ID with the MongoDB `_id`
5. If it fails, mark as unsynced—retry on next login

This means the UI never feels sluggish; backend failures don't interrupt your workflow.

### Rate Limiting

MangaDex allows roughly 5 requests per second. To stay under the limit:

- Search debounce: 380ms between keystrokes
- Genre carousel delays: 600ms between batches
- Cover fetching: No delay (single request per manga)

The old Jikan API had a 3 req/sec limit with longer delays (1000ms). Switching to MangaDex improved loading speed by about 40%.

### Error Handling

Errors are categorized by type (search, covers, save, backend, auth) and shown via transient notifications. The notification system creates a DOM element, appends it to the body, and removes it after 3 seconds using CSS animations:

```javascript
function showNotif(msg, type = '') {
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove());
  }, 3000);
}
```

The `type` parameter applies color coding—'error' for red, 'blush' for pink, 'success' for green.

---

## File Structure

```
tsuncovers/
├── index.html          Search, browse, and select covers
├── builder.html        Create and manage 3×3 grids
├── server.js           Backend API and database
├── package.json        Node.js dependencies
└── README.md           This file
```

---

## Setup & Deployment

### Local Development

Clone the repository and install dependencies:

```bash
npm install
```

Create a `.env` file with your credentials:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=random-string-at-least-32-characters
```

Start the server:

```bash
npm start
```

The frontend runs as static files—open `index.html` in a browser. Update the `API_BASE_URL` constant in both HTML files to point to `http://localhost:3000` for local testing.

### Production Deployment

The backend is designed for Render (or any Node.js host). Set environment variables through your hosting platform's dashboard, then deploy. The frontend can be hosted on any static file server—Netlify, Vercel, GitHub Pages, or just serve the HTML files from your backend.

Make sure to update `API_BASE_URL` in both `index.html` and `builder.html` to your production backend URL.

### Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins (your frontend URL)
6. Add authorized redirect URIs (your backend `/auth/google/callback` endpoint)
7. Copy the Client ID and Client Secret to your `.env` file and update the `GOOGLE_CLIENT_ID` constant in both HTML files

---

## Technical Details

### Data Structures

**Manga Object (from MangaDex)**
```javascript
{
  id: "uuid-string",
  type: "manga",
  attributes: {
    title: { en: "Title", ja: "タイトル" },
    description: { en: "Synopsis..." },
    contentRating: "safe" | "suggestive" | "erotica" | "pornographic",
    tags: [{ attributes: { name: { en: "Action" } } }]
  },
  relationships: [
    { type: "cover_art", attributes: { fileName: "abc.jpg" } }
  ]
}
```

**Grid Slot**
```javascript
{
  id: "manga-uuid",           // MangaDex manga ID
  title: "Manga Title",       // Extracted via getMangaTitle()
  image: "https://..."        // Full URL to cover image
}
```

**Saved Grid**
```javascript
{
  id: "grid-id",              // MongoDB _id or temp local ID
  manga: [...9 slots],        // Array of 9 grid slots
  timestamp: 1234567890,      // Unix timestamp
  synced: true                // Whether it's saved to backend
}
```

### CSS Architecture

Styles use CSS custom properties for theming. The app supports dark and light modes via the `data-theme` attribute on the root element:

```css
:root {
  --bg: #0a0a0a;
  --text: #e8e4dc;
  --accent: #c9a96e;
  --blush: #c97070;
}

[data-theme="light"] {
  --bg: #f5f0e8;
  --text: #1a1714;
  /* ... */
}
```

Switching themes just changes the attribute—CSS variables handle the rest.

Layout uses CSS Grid for the main grid builder, Flexbox for the genre carousels, and absolute positioning for modals and overlays. No media queries; the design is desktop-first.

### API Integration

All API calls use the native `fetch()` API. Error handling follows this pattern:

```javascript
try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // process data
} catch (err) {
  console.error(err);
  showNotif("Error message", 'error');
}
```

The backend proxy endpoint rewrites image URLs to avoid CORS issues:

```javascript
app.get('/api/proxy', async (req, res) => {
  const imageUrl = req.query.url;
  const response = await fetch(imageUrl);
  const buffer = await response.buffer();
  res.set('Content-Type', response.headers.get('content-type'));
  res.send(buffer);
});
```

This lets the canvas access external images without `crossOrigin` errors.

---

## Customization

### Adding Genres

Edit the `MANGADEX_TAGS` object in `index.html` (around line 1957):

```javascript
const MANGADEX_TAGS = {
  'YourGenre': 'tag-uuid-from-mangadex-api',
};
```

Then add the genre to the `state.genres` array (line 1616):

```javascript
state.genres = ['Action', 'Romance', 'Fantasy', 'Horror', 'Comedy', 'YourGenre'];
```

Find tag UUIDs by browsing the [MangaDex API docs](https://api.mangadex.org/docs/).

### Changing Grid Size

The grid is hardcoded to 3×3 (9 cells). To change it:

1. Update the grid initialization: `Array(9).fill(null)` → `Array(N).fill(null)`
2. Modify the CSS grid template: `.grid { grid-template-columns: repeat(3, 1fr); }` → `repeat(X, 1fr)`
3. Adjust canvas dimensions in the download functions

### Styling NSFW Content

NSFW manga (with `contentRating: "pornographic"`) are styled with the `--blush` color. This happens in several places:

```javascript
const isNSFW = manga.attributes?.contentRating === 'pornographic';
const titleStyle = isNSFW ? 'style="color: var(--blush);"' : '';
```

Change the color by modifying the `--blush` custom property, or remove the conditional styling entirely.

---

## Known Issues

**Saved Grids from Before Migration**

Grids saved before the MangaDex migration (when the app used Jikan/MyAnimeList) still work for viewing and downloading. However, the cover picker won't function for these old grids because they store MAL IDs instead of MangaDex UUIDs. To change covers on an old grid, delete it and rebuild from scratch.

**CORS on Some Hosts**

If you deploy the frontend and backend separately, browser security might block image loading. Make sure the backend's CORS middleware allows your frontend domain:

```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com',
  credentials: true
}));
```

**Rate Limiting**

Heavy usage (e.g., rapidly switching between genres or searching) can trigger MangaDex's rate limiter. The app includes delays to prevent this, but if you modify the code, be mindful of request frequency.

---

## API Reference

This application uses the [MangaDex API](https://api.mangadex.org/)—an open-source, community-driven manga database. No API key is required for read operations (search, covers, metadata). Rate limit is approximately 5 requests per second per IP address.

Key endpoints used:

- `GET /manga` — Search manga by title, filter by tags/genres
- `GET /cover` — Retrieve cover art for a specific manga
- `GET /manga/{id}` — Get detailed manga information

Cover images are served from `https://uploads.mangadex.org/covers/` with the format:
```
https://uploads.mangadex.org/covers/{manga-id}/{filename}.{size}.jpg
```

Where `size` can be `512` (medium quality) or omitted (full quality).

---

## License

This project is provided as-is for personal use. The MangaDex API has its own terms of service—respect their rate limits and usage guidelines.

---

**Note**: This is a hobby project. The code prioritizes simplicity and readability over enterprise patterns. If you're looking for a production-grade application with testing, CI/CD, and dependency injection, this isn't it. But if you want to see how much you can build with vanilla JavaScript and minimal dependencies—well, here you go.
