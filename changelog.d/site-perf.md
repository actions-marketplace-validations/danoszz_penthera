section: Site

- **The home page is lighter on your machine, with the same look.** The
  dithered field in the hero draws at up to 60 frames a second while the
  pointer moves and 20 while it only drifts, instead of every display frame
  (120 on ProMotion screens), and skips the columns its mask hides. The metal
  plates' pointer light no longer forces a style pass per plate and only
  touches the plates it can reach. The bottom blur gives each of its six
  layers only the strip its mask shows, and is hidden once faded out. The
  12-second loop, the Go Pro plate's glow and the footer's LED pause off
  screen, and the LED breathes by opacity instead of repainting its glow. On the hero,
  main-thread time while idle drops from about 45% to about 6%.
