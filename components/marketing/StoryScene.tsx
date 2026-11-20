import Image from "next/image";
import styles from "./StoryScene.module.css";

/** Official artwork is decorative; it never represents a visitor's private library. */
export function StoryScene() {
  return (
    <figure className={styles.scene} aria-label="Anime worlds">
      <div className={styles.orbit} aria-hidden="true" />
      <div className={`${styles.still} theme-art-light`}>
        <Image src="/artwork/tanjiro.jpg" alt="" fill sizes="(max-width: 600px) 55vw, 340px" loading="eager" />
        <span>Demon Slayer</span>
      </div>
      <div className={`${styles.still} theme-art-dark`}>
        <Image src="/artwork/shinra.png" alt="" fill sizes="(max-width: 600px) 55vw, 340px" loading="eager" />
        <span>Fire Force</span>
      </div>
      <div className={styles.luffy}>
        <Image src="/artwork/luffy.png" alt="" fill sizes="(max-width: 600px) 50vw, 270px" loading="eager" />
        <span>One Piece Film: Red</span>
      </div>
      <div className={`${styles.lead} ${styles.asta} theme-art-light`}>
        <Image src="/artwork/asta.png" alt="" width={695} height={1460} sizes="(max-width: 600px) 75vw, 420px" loading="eager" />
      </div>
      <div className={`${styles.lead} ${styles.ichigo} theme-art-dark`}>
        <Image src="/artwork/ichigo.png" alt="" width={1024} height={1440} sizes="(max-width: 600px) 72vw, 420px" loading="eager" />
      </div>
      <div className={styles.caption}>
        <span className="theme-art-light">Black Clover</span>
        <span className="theme-art-dark">Bleach</span>
      </div>
      <figcaption className={styles.credits}>
        Official artwork:
        <span className="theme-art-light">
          <a href="https://bclover.jp/character/asta.php" target="_blank" rel="noreferrer">Asta</a> ·{" "}
          <a href="https://kimetsu.com/anime/character/risshihen/" target="_blank" rel="noreferrer">Tanjiro</a>
        </span>
        <span className="theme-art-dark">
          <a href="https://bleach-anime.com/character/?chara=01" target="_blank" rel="noreferrer">Ichigo</a> ·{" "}
          <a href="https://fireforce-anime.jp/character/" target="_blank" rel="noreferrer">Shinra</a>
        </span>
        · <a href="https://www.onepiece-film.jp/red/movie/" target="_blank" rel="noreferrer">Luffy ↗</a>
      </figcaption>
    </figure>
  );
}
