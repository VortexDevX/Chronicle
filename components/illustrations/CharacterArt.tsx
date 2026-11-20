import Image from "next/image";

const characters = {
  frieren: { name: "Frieren", file: "frieren.png", source: "https://frieren-anime.jp/character/chara_group1/1-1/" },
  fern: { name: "Fern", file: "fern.png", source: "https://frieren-anime.jp/character/chara_group1/1-5/" },
  rukia: { name: "Rukia Kuchiki", file: "rukia.png", source: "https://bleach-anime.com/character/?chara=20" },
  senku: { name: "Senku Ishigami", file: "senku.png", source: "https://dr-stone.jp/character/?c=c1" },
  luffy: { name: "Monkey D. Luffy", file: "luffy.png", source: "https://www.onepiece-film.jp/red/movie/" },
};

/** Official character artwork, used as decoration rather than a user's library entry. */
export function CharacterArt({ character = "frieren", variant = "portrait" }: {
  character?: keyof typeof characters;
  variant?: "portrait" | "welcome" | "postcard";
}) {
  const art = characters[character];
  return <figure className={`character-art character-art--${variant}`} data-character={character}>
    <div className="character-art-window">
      <Image src={`/artwork/${art.file}`} alt="" fill sizes={variant === "welcome" ? "352px" : variant === "postcard" ? "170px" : "225px"} />
    </div>
    <figcaption><a href={art.source} target="_blank" rel="noreferrer">{art.name} · Official artwork ↗</a></figcaption>
  </figure>;
}
