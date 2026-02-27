# Template Import Usage

Use these files to bulk import entries into Chronicle:

- `anime-template.csv`
- `manhwa-template.csv`
- `donghua-template.csv`
- `light-novel-template.csv`
- `chronicle-import-templates.xlsx` (4 sheets)

## 1) Pick The Right Template

- Anime: use `anime-template.csv` or `Anime` sheet in the `.xlsx`
- Manhwa: use `manhwa-template.csv` or `Manhwa` sheet
- Donghua: use `donghua-template.csv` or `Donghua` sheet
- Light Novel: use `light-novel-template.csv` or `LightNovel` sheet

## 2) Keep The Header Row

Do not rename/remove this header row:

```csv
title,type,status,current,total,rating,notes
```

## 3) Fill Rows (One Entry Per Row)

- `title`: required, media name
- `type`: required, use `Anime`, `Manhwa`, `Donghua`, `Light Novel`
- `status`: required, use `Watching/Reading`, `Planned`, `On Hold`, `Dropped`, `Completed`
- `current`: optional number, current progress
- `total`: optional number, total episodes/chapters
- `rating`: optional number from `0` to `10`
- `notes`: optional text

Rules:

- `current` and `total` must be `>= 0`
- if `total > 0`, `current` must not be greater than `total`
- empty/invalid required fields are skipped during import

## 4) Import In App

1. Open Chronicle dashboard.
2. Click `Import`.
3. Select your `.csv` or `.xlsx` file.
4. Wait for the import toast message (`Imported X entries, Y skipped`).

## MAL Export Import (No Manual Reformat Needed)

Chronicle now auto-detects MyAnimeList export columns from `.csv` and `.xlsx`.

- Supported source columns include common MAL fields like:
  - `series_title`
  - `my_status`
  - `my_watched_episodes` / `series_episodes`
  - `my_read_chapters` / `series_chapters`
  - `my_score`, `my_comments`, `my_tags`, `series_type`
- Anime list entries import as `Anime`.
- Manga list entries are mapped to:
  - `Light Novel` when `series_type` contains `novel`
  - otherwise `Manhwa` (default)
- MAL statuses are normalized into Chronicle statuses automatically.

## Examples By Type

```csv
title,type,status,current,total,rating,notes
Attack on Titan,Anime,Watching/Reading,12,25,9,Season in progress
Solo Leveling,Manhwa,Watching/Reading,120,200,9,Caught up this week
Link Click,Donghua,Planned,0,24,,Will start soon
Lord of the Mysteries,Light Novel,Watching/Reading,340,1432,10,Peak world-building
```
