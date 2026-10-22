# Case study: the PHP security release of 21 October 2026

> **Project page.** For "what could a scanner tell you on the day of a critical PHP release, and what could it not?"

On 21 October 2026, PHP fixed two remote code execution flaws rated 9.2 out
of 10. In the Netherlands, DigiD, MijnOverheid, the Tweede Kamer and RTL took
their sites offline as a precaution. This page records what happened that day,
what we built in response, and where any version-based scanner, Penthera
included, stops being useful.

**Status.** Released in 1.8.0 (`npx penthera`), with the
rules in the signed `advisories` pack.

## Timeline

All times are UTC.

| When | What | Source |
|---|---|---|
| 20 Oct | PHP announces a security release for 21 Oct at 14:00: two critical flaws, both CVSS 4.0 9.2, details to follow with the release | [php.net, 20 Oct](https://www.php.net/archive/2026.php#2026-10-20-1) |
| 21 Oct, morning | Dutch government, education and media sites go offline as a precaution. NOS reports that details of the flaw circulated after the announcement. ncsc.nl itself is offline "vanwege de kwetsbaarheden in PHP" [because of the PHP vulnerabilities] | [NOS liveblog](https://nos.nl/liveblog/2636066-websites-kwetsbaar-voor-softwarelek-digid-en-mijnoverheid-uit-de-lucht) |
| 11:13 | The NCSC has seen no active abuse yet, NOS reports, and urges everyone to update | NOS liveblog |
| 12:10 | Penthera's runtime advisory engine is committed, with tests and benchmark cases, but without the new PHP versions | branch `feat/runtime-advisories` |
| by 13:36 | PHP releases 8.5.12, 8.4.27, 8.3.36 and 8.2.35, ahead of the announced 14:00 | [PHP 8 ChangeLog](https://www.php.net/ChangeLog-8.php) |
| 13:37 | The rule for both CVEs is committed, with the fixed versions copied from the php-src advisories | commit `69a3702` |

The two-minute gap between release and rule needs context. A background job
was already polling php.net for the new versions, and the engine had been
written that morning. Two minutes is the time to copy and test vendor data,
not to build a detection.

## The two flaws

| | CVE-2026-109618 | CVE-2026-109619 |
|---|---|---|
| php-src advisory | [GHSA-w8hw-w9fx-j79w](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w) | [GHSA-6wmf-4rv5-p3rp](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp) |
| What | Running out of memory during request parsing leaves request data half initialized, and cleanup then uses it | Internal state from one request survives after its memory is freed, and the next request on the same worker uses it |
| Severity | Critical, CVSS 4.0 9.2 | Critical, CVSS 4.0 9.2 |
| Fixed in | 8.2.35, 8.3.36, 8.4.27, 8.5.12 | same |

PHP's [security advisory](https://www.php.net/archive/2026.php#2026-10-21-5)
lists every way of serving PHP on the web as at risk: PHP-FPM, Apache with
mod_php, php-cgi, FrankenPHP and LiteSpeed. The risk is highest for mod_php,
where an unauthenticated request can trigger the attack before any application
code runs. PHP says updating is the only complete fix. PHP 8.1 and older get no
update from the PHP project.

## What a scanner can see

Penthera's new check reads two kinds of evidence.

From outside, it reads what a site says about itself: the `X-Powered-By` and
`Server` headers, PHP's default `PHPSESSID` cookie name, and links to `.php`
pages. This is common. In a 2018 scan of the top one million websites,
`X-Powered-By` appeared in 48% of responses, and two thirds of those carried
the PHP version (Lavrenovs & Melon, 2018).

From the repository, it reads what the project pins: Docker base images such
as `php:8.3.12-fpm`, `.php-version`, `.tool-versions` and `composer.json`.

Each version gets one of four answers:

| Answer | When |
|---|---|
| Affected | An exact upstream version below the fix, such as `PHP/8.3.35` |
| End of life, no fix | A version on a line PHP no longer supports, such as `PHP/8.1.34` |
| Check on the server | PHP is in use, but the version is hidden, floating (`php:8.3`), or a Linux distribution build (`8.3.6-1ubuntu1.4`) |
| Has the fix, as advertised | A version at or above the fix |

We tested this on a local server that sends `X-Powered-By: PHP/8.3.35`. The
scan reported both CVEs as critical, confidence likely.

## Why "check on the server" is most of the work

Three facts limit any check that works from version numbers.

**Distributions patch without changing the number.** PHP's advisory says Linux
distributions received the patches in advance. Ubuntu, Debian and Red Hat fix
packages by backporting, so a fixed package can still report an old upstream
version. Red Hat and Ubuntu both say that scanners which judge by version
number alone produce false positives for this reason. We found no
peer-reviewed study that measures how often. Penthera never reports a
distribution build as affected. It asks you to check the distribution's
security tracker for the CVE.

**A hidden version proves nothing.** Many servers turn off the PHP header, and
a CDN in front of a site hides the origin. Fingerprinting research shows that
removing the header does not stop identification (Kar et al., 2022). The NCSC's
guidelines for web applications say removing the version number "helpt ten
dele" [helps partly], and ask for a deliberate trade-off (Nationaal Cyber
Security Centrum, 2024). When Penthera sees PHP but no version, it says it
cannot tell. It never reports the site as safe.

**Counting by version overestimates.** In 2024, Censys counted about 458,800
exposed PHP instances for CVE-2024-4577 and called that likely an overestimate,
because a scan cannot see whether the vulnerable configuration is on (Censys,
2024).

## What no scanner could do that day

Between the announcement and the release, there was no fix to check for. NOS
reports that details circulated in that window. A version check cannot help
until the vendor says which versions are fixed. We did not try to guess them,
and the pack contains only versions copied from php-src after the release.

## An independent cross-check

On the same day, OpenAI published its own checker for these flaws,
[php2shell-checker](https://github.com/openai/php2shell-checker) (OpenAI,
2026). It reads the same evidence (`X-Powered-By` and `Server`, or `php -v`
locally) and compares it against a table of the last vulnerable patch per
branch. Its fixed versions match the ones Penthera copied from php-src:
8.2.35, 8.3.36, 8.4.27 and 8.5.12. Both tools also treat every release of
8.1 and older as vulnerable. A test in `tests/runtime-advisories.test.js`
checks all 14 branches in OpenAI's table against Penthera, and fails if the
two ever disagree.

The two tools were built separately from the same vendor data, so agreement
shows the version data was copied correctly. It does not show that either
check is complete: both see only what a server reveals, and both say a hidden
version or a distribution build cannot be judged from outside.

## What to do

1. List every place that runs PHP, including forgotten sites, admin panels and
   subdomains. Your own inventory beats any outside scan.
2. On each server or container, run `php -v`.
3. For a distribution package, check the distribution's tracker for
   CVE-2026-109618 and CVE-2026-109619 instead of the upstream number.
4. Upgrade to 8.2.35, 8.3.36, 8.4.27 or 8.5.12. On 8.1 or older, move to a
   supported line or to a vendor that still patches it.

## What this case shows about the approach

- **Detection data can move faster than releases.** The advisory is a signed,
  hash-checked data file with a vendor source per rule. Once the rule kind is
  released, a new advisory can be loaded with `--rules` on the day it is
  published, without a new Penthera version and without a live feed.
- **The useful window is after the release.** Small and hobby sites often run
  old versions for years. That long tail is where an owner-run, offline check
  helps.
- **Honest answers need a third option.** Between "affected" and "safe" sits
  "we cannot tell from here". On a day like this, that answer applies to most
  sites.

The method, its sources and its limits are in the methodology's
[runtime advisories](../METHODOLOGY.md#runtime-advisories) section.

## References

Censys. (2024, June 10). *PHP-CGI argument injection vulnerability could lead to remote code execution*. <https://censys.com/advisory/cve-2024-4577/>

Kar, A., Natadze, A., Branca, E., & Stakhanova, N. (2022). HTTPFuzz: Web server fingerprinting with HTTP request fuzzing. In *Proceedings of the 19th International Conference on Security and Cryptography* (pp. 261–271). SCITEPRESS. <https://doi.org/10.5220/0011328900003283>

Lavrenovs, A., & Melon, F. J. R. (2018). HTTP security headers analysis of top one million websites. In *2018 10th International Conference on Cyber Conflict (CyCon)* (pp. 345–370). IEEE. <https://doi.org/10.23919/CYCON.2018.8405025>

Nationaal Cyber Security Centrum. (2024, May). *ICT-beveiligingsrichtlijnen voor webapplicaties* [ICT security guidelines for web applications].

OpenAI. (2026). *php2shell-checker* [Computer software]. GitHub. <https://github.com/openai/php2shell-checker/tree/40a4746ec4925d4d7510b99f9e134277918b1ac3>

NOS. (2026, October 21). *Websites kwetsbaar voor softwarelek: RTL Nieuws, DigiD en MijnOverheid uit de lucht* [Liveblog]. <https://nos.nl/liveblog/2636066-websites-kwetsbaar-voor-softwarelek-digid-en-mijnoverheid-uit-de-lucht>

The PHP Group. (2026, October 21). *Security advisory: Critical remote code execution vulnerabilities, update now*. <https://www.php.net/archive/2026.php#2026-10-21-5>
