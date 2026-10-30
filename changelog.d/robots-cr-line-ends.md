section: Fixed

- **The live check now honors an opt-out in a robots.txt with bare CR line ends or
  a UTF-8 byte order mark.** RFC 9309 allows both, and such an opt-out used to be
  missed. Its other requests and scores do not change.
