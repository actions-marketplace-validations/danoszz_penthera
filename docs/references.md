---
title: "References"
sidebarTitle: "References"
description: "The research and standards Penthera's methodology and findings cite, in APA 7th edition style."
---

The research and standards that Penthera's [methodology](METHODOLOGY.md) and per-finding sources cite, in APA 7th edition style, grouped by topic and sorted alphabetically by first author within each group. The BibTeX source is [references.bib](https://github.com/danoszz/penthera/blob/main/docs/references.bib); this page is generated from it by `node scripts/build-references.mjs`, and a test fails if the two drift or if a citation in METHODOLOGY.md does not resolve to an entry here.

Every entry was checked against the publisher or standards body (Crossref DOI metadata, USENIX, NDSS, arXiv, the RFC Editor, OWASP, MITRE, OASIS, the EU Publications Office) on 2026-10-19. Entries that could not be verified were left out, and so were fields (pages, volume, issue, editors) that the publisher's metadata does not record. Each entry has an anchor named after its BibTeX key, for example [`#bau2010state`](#bau2010state), which is also the key reports and SARIF use.

Entries marked † are further reading: they inform the work but are not cited in the methodology.

## Black-box scanning and benchmarking

<a id="antunes2010benchmarking"></a>Antunes, N., & Vieira, M. (2010). Benchmarking vulnerability detection tools for web services. In *2010 IEEE International Conference on Web Services (ICWS)* (pp. 203–210). IEEE. [https://doi.org/10.1109/ICWS.2010.76](https://doi.org/10.1109/ICWS.2010.76)

<a id="antunes2015assessing"></a>Antunes, N., & Vieira, M. (2015). Assessing and comparing vulnerability detection tools for web services: Benchmarking approach and examples. *IEEE Transactions on Services Computing*, *8*(2), 269–283. [https://doi.org/10.1109/TSC.2014.2310221](https://doi.org/10.1109/TSC.2014.2310221)

<a id="bau2010state"></a>Bau, J., Bursztein, E., Gupta, D., & Mitchell, J. (2010). State of the art: Automated black-box web application vulnerability testing. In *2010 IEEE Symposium on Security and Privacy* (pp. 332–345). IEEE. [https://doi.org/10.1109/SP.2010.27](https://doi.org/10.1109/SP.2010.27)

<a id="doupe2010johnny"></a>Doupé, A., Cova, M., & Vigna, G. (2010). Why Johnny can't pentest: An analysis of black-box web vulnerability scanners. In C. Kreibich & M. Jahnke (Eds.), *Detection of Intrusions and Malware, and Vulnerability Assessment (DIMVA 2010)* (pp. 111–131). Springer. [https://doi.org/10.1007/978-3-642-14215-4_7](https://doi.org/10.1007/978-3-642-14215-4_7)

<a id="durumeric2014heartbleed"></a>Durumeric, Z., Li, F., Kasten, J., Amann, J., Beekman, J., Payer, M., Weaver, N., Adrian, D., Paxson, V., Bailey, M., & Halderman, J. A. (2014). The matter of Heartbleed. In *Proceedings of the 2014 Conference on Internet Measurement Conference (IMC '14)* (pp. 475–488). ACM. [https://doi.org/10.1145/2663716.2663755](https://doi.org/10.1145/2663716.2663755)

<a id="kapoor2023leakage"></a>† Kapoor, S., & Narayanan, A. (2023). Leakage and the reproducibility crisis in machine-learning-based science. *Patterns*, *4*(9), Article 100804. [https://doi.org/10.1016/j.patter.2023.100804](https://doi.org/10.1016/j.patter.2023.100804)

<a id="kar2022httpfuzz"></a>Kar, A., Natadze, A., Branca, E., & Stakhanova, N. (2022). HTTPFuzz: Web server fingerprinting with HTTP request fuzzing. In *Proceedings of the 19th International Conference on Security and Cryptography* (pp. 261–271). SCITEPRESS. [https://doi.org/10.5220/0011328900003283](https://doi.org/10.5220/0011328900003283)

<a id="lee2002detecting"></a>Lee, D., Rowe, J., Ko, C., & Levitt, K. (2002). Detecting and defending against web-server fingerprinting. In *18th Annual Computer Security Applications Conference, 2002. Proceedings.* (pp. 321–330). IEEE Computer Society. [https://doi.org/10.1109/CSAC.2002.1176304](https://doi.org/10.1109/CSAC.2002.1176304)

<a id="li2022odgen"></a>† Li, S., Kang, M., Hou, J., & Cao, Y. (2022). Mining Node.js vulnerabilities via object dependence graph and query. In *31st USENIX Security Symposium (USENIX Security 22)* (pp. 143–160). USENIX Association. [https://www.usenix.org/conference/usenixsecurity22/presentation/li-song](https://www.usenix.org/conference/usenixsecurity22/presentation/li-song)

<a id="lyon2009nmap"></a>Lyon, G. (2009). *Nmap network scanning: The official Nmap project guide to network discovery and security scanning*. Insecure.Com LLC. [https://nmap.org/book/vscan.html](https://nmap.org/book/vscan.html)

<a id="nappa2015clones"></a>Nappa, A., Johnson, R., Bilge, L., Caballero, J., & Dumitras, T. (2015). The attack of the clones: A study of the impact of shared code on vulnerability patching. In *2015 IEEE Symposium on Security and Privacy* (pp. 692–708). IEEE. [https://doi.org/10.1109/SP.2015.48](https://doi.org/10.1109/SP.2015.48)

<a id="owaspbenchmark"></a>OWASP Foundation. (n.d.-a). *OWASP Benchmark project* (Version 1.2). Retrieved October 19, 2026, from [https://owasp.org/www-project-benchmark/](https://owasp.org/www-project-benchmark/)

<a id="nucleiphpdetect"></a>ProjectDiscovery. (n.d.). *Nuclei-templates: Php-detect.yaml*. Retrieved October 21, 2026, from [https://github.com/projectdiscovery/nuclei-templates/blob/main/http/technologies/php-detect.yaml](https://github.com/projectdiscovery/nuclei-templates/blob/main/http/technologies/php-detect.yaml)

<a id="vasek2016hacking"></a>Vasek, M., Wadleigh, J., & Moore, T. (2016). Hacking is not random: A case-control study of webserver-compromise risk. *IEEE Transactions on Dependable and Secure Computing*, 206–219. [https://doi.org/10.1109/TDSC.2015.2427847](https://doi.org/10.1109/TDSC.2015.2427847)

## Security design principles

<a id="saltzer1975protection"></a>Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE*, *63*(9), 1278–1308. [https://doi.org/10.1109/PROC.1975.9939](https://doi.org/10.1109/PROC.1975.9939)

<a id="schneier1999secure"></a>† Schneier, B., & Kelsey, J. (1999). Secure audit logs to support computer forensics. *ACM Transactions on Information and System Security*, *2*(2), 159–176. [https://doi.org/10.1145/317087.317089](https://doi.org/10.1145/317087.317089)

## Threat modeling

<a id="kohnfelder1999threats"></a>Kohnfelder, L., & Garg, P. (1999). *The threats to our products* [Internal publication]. Microsoft. Retrieved October 19, 2026, from [https://shostack.org/files/microsoft/The-Threats-To-Our-Products.docx](https://shostack.org/files/microsoft/The-Threats-To-Our-Products.docx)

<a id="shostack2014threat"></a>Shostack, A. (2014). *Threat modeling: Designing for security*. Wiley. [https://www.wiley-vch.de/de/fachgebiete/computer-und-informatik/threat-modeling-978-1-118-80999-0](https://www.wiley-vch.de/de/fachgebiete/computer-und-informatik/threat-modeling-978-1-118-80999-0)

## Software supply chain

<a id="datadog2023malicious"></a>† Datadog Security Labs. (2023, March 20). *Open-source dataset of malicious software packages*. GitHub. Retrieved October 29, 2026, from [https://github.com/datadog/malicious-software-packages-dataset](https://github.com/datadog/malicious-software-packages-dataset)

<a id="ladisa2023sok"></a>Ladisa, P., Plate, H., Martinez, M., & Barais, O. (2023). SoK: Taxonomy of attacks on open-source software supply chains. In *2023 IEEE Symposium on Security and Privacy (SP)* (pp. 1509–1526). IEEE. [https://doi.org/10.1109/SP46215.2023.10179304](https://doi.org/10.1109/SP46215.2023.10179304)

<a id="lamb2022reproducible"></a>† Lamb, C., & Zacchiroli, S. (2022). Reproducible builds: Increasing the integrity of software supply chains. *IEEE Software*, *39*(2), 62–70. [https://doi.org/10.1109/MS.2021.3073045](https://doi.org/10.1109/MS.2021.3073045)

<a id="lauinger2017thou"></a>Lauinger, T., Chaabane, A., Arshad, S., Robertson, W., Wilson, C., & Kirda, E. (2017). Thou shalt not depend on me: Analysing the use of outdated JavaScript libraries on the web. In *Proceedings 2017 Network and Distributed System Security Symposium*. Internet Society. [https://doi.org/10.14722/ndss.2017.23414](https://doi.org/10.14722/ndss.2017.23414)

<a id="ohm2020backstabber"></a>Ohm, M., Plate, H., Sykosch, A., & Meier, M. (2020). Backstabber's knife collection: A review of open source software supply chain attacks. In C. Maurice, L. Bilge, G. Stringhini, & N. Neves (Eds.), *Detection of Intrusions and Malware, and Vulnerability Assessment (DIMVA 2020)* (pp. 23–43). Springer. [https://doi.org/10.1007/978-3-030-52683-2_2](https://doi.org/10.1007/978-3-030-52683-2_2)

<a id="samuel2010survivable"></a>Samuel, J., Mathewson, N., Cappos, J., & Dingledine, R. (2010). Survivable key compromise in software update systems. In *Proceedings of the 17th ACM Conference on Computer and Communications Security (CCS '10)* (pp. 61–72). ACM. [https://doi.org/10.1145/1866307.1866315](https://doi.org/10.1145/1866307.1866315)

<a id="thompson1984reflections"></a>Thompson, K. (1984). Reflections on trusting trust. *Communications of the ACM*, *27*(8), 761–763. [https://doi.org/10.1145/358198.358210](https://doi.org/10.1145/358198.358210)

<a id="torresarias2019intoto"></a>Torres-Arias, S., Afzali, H., Kuppusamy, T. K., Curtmola, R., & Cappos, J. (2019). in-toto: Providing farm-to-table guarantees for bits and bytes. In *28th USENIX Security Symposium (USENIX Security 19)* (pp. 1393–1410). USENIX Association. [https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias](https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias)

<a id="zimmermann2019small"></a>Zimmermann, M., Staicu, C.-A., Tenny, C., & Pradel, M. (2019). Small world with high risks: A study of security threats in the npm ecosystem. In *28th USENIX Security Symposium (USENIX Security 19)* (pp. 995–1010). USENIX Association. [https://www.usenix.org/conference/usenixsecurity19/presentation/zimmerman](https://www.usenix.org/conference/usenixsecurity19/presentation/zimmerman)

## Secret leakage

<a id="basak2023secretbench"></a>Basak, S. K., Neil, L., Reaves, B., & Williams, L. (2023). SecretBench: A dataset of software secrets. In *2023 IEEE/ACM 20th International Conference on Mining Software Repositories (MSR)* (pp. 347–351). IEEE. [https://doi.org/10.1109/MSR59073.2023.00053](https://doi.org/10.1109/MSR59073.2023.00053)

<a id="meli2019bad"></a>Meli, M., McNiece, M. R., & Reaves, B. (2019). How bad can it Git? Characterizing secret leakage in public GitHub repositories. In *Proceedings 2019 Network and Distributed System Security Symposium*. Internet Society. [https://doi.org/10.14722/ndss.2019.23418](https://doi.org/10.14722/ndss.2019.23418)

<a id="yun2021creddata"></a>† Yun, J., Choi, S., Lee, Y., Sokol, O., Shim, W., Melkonyan, A., & Kuzmenko, D. (2021). *Project CredData: A dataset of credentials for research*. GitHub. Retrieved October 29, 2026, from [https://github.com/Samsung/CredData](https://github.com/Samsung/CredData)

## Web application security

<a id="barth2008robust"></a>Barth, A., Jackson, C., & Mitchell, J. C. (2008). Robust defenses for cross-site request forgery. In *Proceedings of the 15th ACM Conference on Computer and Communications Security (CCS '08)* (pp. 75–88). ACM. [https://doi.org/10.1145/1455770.1455782](https://doi.org/10.1145/1455770.1455782)

<a id="bhuiyan2023secbenchjs"></a>† Bhuiyan, M. H. M., Parthasarathy, A. S., Vasilakis, N., Pradel, M., & Staicu, C.-A. (2023). SecBench.js: An executable security benchmark suite for server-side JavaScript. In *2023 IEEE/ACM 45th International Conference on Software Engineering (ICSE)* (pp. 1059–1070). IEEE. [https://doi.org/10.1109/ICSE48619.2023.00096](https://doi.org/10.1109/ICSE48619.2023.00096)

<a id="chen2018cors"></a>Chen, J., Jiang, J., Duan, H., Wan, T., Chen, S., Paxson, V., & Yang, M. (2018). We still don't have secure cross-domain requests: An empirical study of CORS. In *27th USENIX Security Symposium (USENIX Security 18)* (pp. 1079–1093). USENIX Association. [https://www.usenix.org/conference/usenixsecurity18/presentation/chen-jianjun](https://www.usenix.org/conference/usenixsecurity18/presentation/chen-jianjun)

<a id="crosby2009opportunities"></a>Crosby, S. A., Wallach, D. S., & Riedi, R. H. (2009). Opportunities and limits of remote timing attacks. *ACM Transactions on Information and System Security*, *12*(3), 1–29. [https://doi.org/10.1145/1455526.1455530](https://doi.org/10.1145/1455526.1455530)

<a id="fett2016comprehensive"></a>Fett, D., Küsters, R., & Schmitz, G. (2016). A comprehensive formal security analysis of OAuth 2.0. In *Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16)* (pp. 1204–1215). ACM. [https://doi.org/10.1145/2976749.2978385](https://doi.org/10.1145/2976749.2978385)

<a id="heninger2012mining"></a>† Heninger, N., Durumeric, Z., Wustrow, E., & Halderman, J. A. (2012). Mining your Ps and Qs: Detection of widespread weak keys in network devices. In *21st USENIX Security Symposium (USENIX Security 12)* (pp. 205–220). USENIX Association. [https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/heninger](https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/heninger)

<a id="hodges2012rfc6797"></a>Hodges, J., Jackson, C., & Barth, A. (2012). *HTTP strict transport security (HSTS)* (RFC 6797). RFC Editor. [https://doi.org/10.17487/RFC6797](https://doi.org/10.17487/RFC6797)

<a id="jones2015rfc7519"></a>Jones, M., Bradley, J., & Sakimura, N. (2015). *JSON web token (JWT)* (RFC 7519). RFC Editor. [https://doi.org/10.17487/RFC7519](https://doi.org/10.17487/RFC7519)

<a id="kitterman2014rfc7208"></a>Kitterman, S. (2014). *Sender policy framework (SPF) for authorizing use of domains in email, version 1* (RFC 7208). RFC Editor. [https://doi.org/10.17487/RFC7208](https://doi.org/10.17487/RFC7208)

<a id="kocher1996timing"></a>Kocher, P. C. (1996). Timing attacks on implementations of Diffie-Hellman, RSA, DSS, and other systems. In N. Koblitz (Ed.), *Advances in Cryptology – CRYPTO '96* (pp. 104–113). Springer. [https://doi.org/10.1007/3-540-68697-5_9](https://doi.org/10.1007/3-540-68697-5_9)

<a id="kucherawy2015rfc7489"></a>Kucherawy, M., & Zwicky, E. (2015). *Domain-based message authentication, reporting, and conformance (DMARC)* (RFC 7489). RFC Editor. [https://doi.org/10.17487/RFC7489](https://doi.org/10.17487/RFC7489)

<a id="lavrenovs2018http"></a>Lavrenovs, A., & Melon, F. J. R. (2018). HTTP security headers analysis of top one million websites. In *2018 10th International Conference on Cyber Conflict (CyCon)* (pp. 345–370). IEEE. [https://doi.org/10.23919/CYCON.2018.8405025](https://doi.org/10.23919/CYCON.2018.8405025)

<a id="lekies2013flows"></a>Lekies, S., Stock, B., & Johns, M. (2013). 25 million flows later: Large-scale detection of DOM-based XSS. In *Proceedings of the 2013 ACM SIGSAC Conference on Computer and Communications Security (CCS '13)* (pp. 1193–1204). ACM. [https://doi.org/10.1145/2508859.2516703](https://doi.org/10.1145/2508859.2516703)

<a id="lodderstedt2025rfc9700"></a>Lodderstedt, T., Bradley, J., Labunets, A., & Fett, D. (2025). *Best current practice for OAuth 2.0 security* (RFC 9700, BCP 240). RFC Editor. [https://doi.org/10.17487/RFC9700](https://doi.org/10.17487/RFC9700)

<a id="nemec2017roca"></a>† Nemec, M., Sys, M., Svenda, P., Klinec, D., & Matyas, V. (2017). The return of Coppersmith's attack: Practical factorization of widely used RSA moduli. In *Proceedings of the 2017 ACM SIGSAC Conference on Computer and Communications Security* (pp. 1631–1648). ACM. [https://doi.org/10.1145/3133956.3133969](https://doi.org/10.1145/3133956.3133969)

<a id="owaspwstg42"></a>OWASP Foundation. (n.d.-b). *OWASP Web Security Testing Guide, version 4.2*. Retrieved October 19, 2026, from [https://wstg.owasp.org/v4.2/](https://wstg.owasp.org/v4.2/)

<a id="owasp2021top10"></a>OWASP Foundation. (2021). *OWASP Top 10:2021*. Retrieved October 19, 2026, from [https://top10.owasp.org/2021](https://top10.owasp.org/2021)

<a id="owasp2023api"></a>OWASP Foundation. (2023). *OWASP Top 10 API security risks – 2023*. OWASP API Security Project. Retrieved October 19, 2026, from [https://owasp.org/API-Security/editions/2023/en/0x11-t10/](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

<a id="owasp2025top10"></a>OWASP Foundation. (2025c). *OWASP Top 10:2025*. Retrieved October 19, 2026, from [https://top10.owasp.org/2025](https://top10.owasp.org/2025)

<a id="phpexposephp"></a>The PHP Group. (n.d.-a). *Description of core php.ini directives: Expose\_php*. PHP Manual. Retrieved October 21, 2026, from [https://www.php.net/manual/en/ini.core.php](https://www.php.net/manual/en/ini.core.php)

<a id="sakimura2015rfc7636"></a>Sakimura, N., Bradley, J., & Agarwal, N. (2015). *Proof key for code exchange by OAuth public clients* (RFC 7636). RFC Editor. [https://doi.org/10.17487/RFC7636](https://doi.org/10.17487/RFC7636)

<a id="sheffer2020rfc8725"></a>Sheffer, Y., Hardt, D., & Jones, M. (2020). *JSON web token best current practices* (RFC 8725, BCP 225). RFC Editor. [https://doi.org/10.17487/RFC8725](https://doi.org/10.17487/RFC8725)

<a id="stock2014precise"></a>Stock, B., Lekies, S., Mueller, T., Spiegel, P., & Johns, M. (2014). Precise client-side protection against DOM-based cross-site scripting. In *23rd USENIX Security Symposium (USENIX Security 14)* (pp. 655–670). USENIX Association. [https://www.usenix.org/conference/usenixsecurity14/technical-sessions/presentation/stock](https://www.usenix.org/conference/usenixsecurity14/technical-sessions/presentation/stock)

<a id="stock2016hey"></a>Stock, B., Pellegrino, G., Rossow, C., Johns, M., & Backes, M. (2016). Hey, you have a problem: On the feasibility of Large-Scale web vulnerability notification. In *25th USENIX Security Symposium (USENIX Security 16)* (pp. 1015–1032). USENIX Association. [https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/stock](https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/stock)

<a id="weichselbaum2016csp"></a>Weichselbaum, L., Spagnuolo, M., Lekies, S., & Janc, A. (2016). CSP is dead, long live CSP! On the insecurity of whitelists and the future of Content Security Policy. In *Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16)* (pp. 1376–1387). ACM. [https://doi.org/10.1145/2976749.2978363](https://doi.org/10.1145/2976749.2978363)

## LLM and agent security

<a id="amodei2016concrete"></a>† Amodei, D., Olah, C., Steinhardt, J., Christiano, P., Schulman, J., & Mané, D. (2016). *Concrete problems in AI safety* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.1606.06565](https://doi.org/10.48550/arXiv.1606.06565)

<a id="anthropic2026incidents"></a>† Anthropic. (2026, July 30). *Investigating three real-world incidents in our cybersecurity evaluations*. Retrieved October 20, 2026, from [https://www.anthropic.com/news/investigating-incidents-cybersecurity-evals](https://www.anthropic.com/news/investigating-incidents-cybersecurity-evals)

<a id="baker2025monitoring"></a>† Baker, B., Huizinga, J., Gao, L., Dou, Z., Guan, M. Y., Madry, A., Zaremba, W., Pachocki, J., & Farhi, D. (2025). *Monitoring reasoning models for misbehavior and the risks of promoting obfuscation* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2503.11926](https://doi.org/10.48550/arXiv.2503.11926)

<a id="bengio2026agents"></a>† Bengio, Y. (2026, September 11). *Why are AI agents lying, cheating and coordinating?* Retrieved October 29, 2026, from [https://yoshuabengio.org/en/blog/why-are-ai-agents-lying-cheating-and-coordinating](https://yoshuabengio.org/en/blog/why-are-ai-agents-lying-cheating-and-coordinating)

<a id="cloudflare2026securityaudit"></a>Cloudflare. (2026). *Security-audit-skill*. Retrieved October 22, 2026, from [https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c](https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c)

<a id="cotra2026huggingface"></a>† Cotra, A. (2026, August 28). *The Hugging Face attack surprised me*. Planned Obsolescence. Retrieved October 29, 2026, from [https://www.planned-obsolescence.org/p/the-hugging-face-attack-surprised](https://www.planned-obsolescence.org/p/the-hugging-face-attack-surprised)

<a id="ding2025primevul"></a>Ding, Y., Fu, Y., Ibrahim, O., Sitawarin, C., Chen, X., Alomair, B., Wagner, D., Ray, B., & Chen, Y. (2025). Vulnerability detection with code language models: How far are we? In *Proceedings of the 47th IEEE/ACM International Conference on Software Engineering (ICSE 2025)*. [https://doi.org/10.48550/arXiv.2403.18624](https://doi.org/10.48550/arXiv.2403.18624)

<a id="dziemian2026ipiarena"></a>† Dziemian, M., Lin, M., Fu, X., Nowak, M., Winter, N., Jones, E., Zou, A., Ahmad, L., Chaudhuri, K., Chennabasappa, S., Davies, X., Deason, L., Edelman, B. L., Emek, T., Evtimov, I., Gust, J., Hamin, M., He, K., Krawiecka, K., . . . Kolter, Z. (2026). *How vulnerable are AI agents to indirect prompt injections? Insights from a large-scale public competition* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2603.15714](https://doi.org/10.48550/arXiv.2603.15714)

<a id="greshake2023signed"></a>Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection. In *Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security (AISec '23)* (pp. 79–90). ACM. [https://doi.org/10.1145/3605764.3623985](https://doi.org/10.1145/3605764.3623985)

<a id="horatau2026huggingface"></a>† Horatau, M. (2026, August 31). *The Hugging Face incident is not an AI story*. Uphack. Retrieved October 29, 2026, from [https://uphack.io/blog/post/the-hugging-face-incident-is-not-an-ai-story/](https://uphack.io/blog/post/the-hugging-face-incident-is-not-an-ai-story/)

<a id="liu2023prompt"></a>Liu, Y., Deng, G., Li, Y., Wang, K., Wang, Z., Wang, X., Zhang, T., Liu, Y., Wang, H., Zheng, Y., Zhang, L. Y., & Liu, Y. (2023). *Prompt injection attack against LLM-integrated applications* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2306.05499](https://doi.org/10.48550/arXiv.2306.05499)

<a id="metr2026investigation"></a>† METR, & Redwood Research. (2026, August 26). *Brief independent investigation of agents' behavior, reasoning and collaboration in the OpenAI / Hugging Face hacking incident*. Retrieved October 20, 2026, from [https://metr.org/hugging-face-incident-report-aug-2026.pdf](https://metr.org/hugging-face-incident-report-aug-2026.pdf)

<a id="mitreatlas"></a>The MITRE Corporation. (n.d.-b). *MITRE ATLAS: Adversarial Threat Landscape for AI Systems*. Retrieved October 19, 2026, from [https://atlas.mitre.org/](https://atlas.mitre.org/)

<a id="noze2026huggingface"></a>† noze S.r.l. (2026, August 7). *Incidente OpenAI e Hugging Face a Black Hat 2026: Token forgiati, plugin Groovy e nove CVE su Artifactory* [The OpenAI and Hugging Face incident at Black Hat 2026: Forged tokens, Groovy plugins and nine CVEs in Artifactory]. Retrieved October 29, 2026, from [https://www.noze.it/insights/black-hat-openai-hugging-face-ricostruzione/](https://www.noze.it/insights/black-hat-openai-hugging-face-ricostruzione/)

<a id="openai2026incident"></a>† OpenAI. (2026a, August 26). *OpenAI–Hugging Face incident: Technical report*. Retrieved October 20, 2026, from [https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf](https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf)

<a id="owasp2024llmtop10"></a>OWASP Foundation. (2024, November 17). *OWASP Top 10 for LLM applications 2025*. OWASP Gen AI Security Project. Retrieved October 19, 2026, from [https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)

<a id="owasp2025mcptop10"></a>OWASP Foundation. (2025a). *OWASP MCP Top 10* [Beta]. Retrieved October 19, 2026, from [https://owasp.org/www-project-mcp-top-10/](https://owasp.org/www-project-mcp-top-10/)

<a id="owasp2025agentic"></a>OWASP Foundation. (2025b, December 9). *OWASP Top 10 for agentic applications for 2026*. OWASP Gen AI Security Project. Retrieved October 19, 2026, from [https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

<a id="perez2022ignore"></a>Perez, F., & Ribeiro, I. (2022). *Ignore previous prompt: Attack techniques for language models* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2211.09527](https://doi.org/10.48550/arXiv.2211.09527)

<a id="spracklen2025package"></a>Spracklen, J., Wijewickrama, R., Sakib, A. H. M. N., Maiti, A., Viswanath, B., & Jadliwala, M. (2025). We have a package for you! A comprehensive analysis of package hallucinations by code generating LLMs. In *34th USENIX Security Symposium (USENIX Security 25)* (pp. 3687–3706). USENIX Association. [https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen)

<a id="wang2026mcptox"></a>† Wang, Z., Gao, Y., Wang, Y., Liu, S., Sun, H., Cheng, H., Shi, G., Du, H., & Li, X. (2026). MCPTox: A benchmark for tool poisoning on real-world MCP servers. In *Proceedings of the AAAI Conference on Artificial Intelligence* (pp. 35811–35819). AAAI. [https://doi.org/10.1609/aaai.v40i42.40895](https://doi.org/10.1609/aaai.v40i42.40895)

<a id="wang2025cybergym"></a>† Wang, Z., Shi, T., He, J., Cai, M., Zhang, J., & Song, D. (2025). *CyberGym: Evaluating AI agents' real-world cybersecurity capabilities at scale* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2506.02548](https://doi.org/10.48550/arXiv.2506.02548)

<a id="zhong2025impossiblebench"></a>† Zhong, Z., Raghunathan, A., & Carlini, N. (2025). *ImpossibleBench: Measuring LLMs' propensity of exploiting test cases* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2510.20270](https://doi.org/10.48550/arXiv.2510.20270)

<a id="zhu2025cvebench"></a>† Zhu, Y., Kellermann, A., Bowman, D., Li, P., Gupta, A., Danda, A., Fang, R., Jensen, C., Ihli, E., Benn, J., Geronimo, J., Dhir, A., Rao, S., Yu, K., Stone, T., & Kang, D. (2025). *CVE-Bench: A benchmark for AI agents' ability to exploit real-world web application vulnerabilities* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2503.17332](https://doi.org/10.48550/arXiv.2503.17332)

## Standards and regulation

<a id="eu2022nis2"></a>European Parliament and Council of the European Union. (2022). *Directive (EU) 2022/2555 of the European Parliament and of the Council of 14 December 2022 on measures for a high common level of cybersecurity across the Union, amending Regulation (EU) No 910/2014 and Directive (EU) 2018/1972, and repealing Directive (EU) 2016/1148 (NIS 2 Directive)*. Official Journal of the European Union, L 333, 27.12.2022, p. 80. Retrieved October 19, 2026, from [https://eur-lex.europa.eu/eli/dir/2022/2555/oj](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)

<a id="oasis2023sarif"></a>Fanning, M. C., & Golding, L. J. (2023, August 28). *Static Analysis Results Interchange Format (SARIF) version 2.1.0 plus errata 01* [OASIS Standard incorporating Approved Errata]. OASIS. Retrieved October 19, 2026, from [https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html)

<a id="first2023cvss4"></a>FIRST. (2023, November 1). *Common vulnerability scoring system version 4.0: Specification document* (Version 1.2). Retrieved October 21, 2026, from [https://www.first.org/cvss/v4.0/specification-document](https://www.first.org/cvss/v4.0/specification-document)

<a id="mitrecwe"></a>The MITRE Corporation. (n.d.-a). *CWE: Common Weakness Enumeration*. Retrieved October 19, 2026, from [https://cwe.mitre.org/](https://cwe.mitre.org/)

<a id="ncsc2015webapps"></a>† Nationaal Cyber Security Centrum. (2015). *ICT-beveiligingsrichtlijnen voor webapplicaties: Richtlijnen* [ICT security guidelines for web applications: Guidelines]. Retrieved October 21, 2026, from [https://www.ncsc.nl/binaries/ncsc/documenten/publicaties/2019/mei/01/ict-beveiligingsrichtlijnen-voor-webapplicaties/ICT-Beveiligingsrichtlijnen-voor-Webapplicaties-Richtlijnen-Leesversie.pdf](https://www.ncsc.nl/binaries/ncsc/documenten/publicaties/2019/mei/01/ict-beveiligingsrichtlijnen-voor-webapplicaties/ICT-Beveiligingsrichtlijnen-voor-Webapplicaties-Richtlijnen-Leesversie.pdf)

<a id="ncsc2024webapps"></a>Nationaal Cyber Security Centrum. (2024). *ICT-beveiligingsrichtlijnen voor webapplicaties* [ICT security guidelines for web applications]. Retrieved October 21, 2026, from [https://www.ncsc.nl/api/media/sites/default/files/Richtlijn%20ICT%20beveiligingsrichtlijnen%20webapplicaties%2007-24_0.pdf](https://www.ncsc.nl/api/media/sites/default/files/Richtlijn%20ICT%20beveiligingsrichtlijnen%20webapplicaties%2007-24_0.pdf)

<a id="oasis2022csaf"></a>Rock, L., Hagen, S., & Schmidt, T. (2022, November 18). *Common security advisory framework version 2.0* [OASIS Standard]. OASIS. Retrieved October 21, 2026, from [https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html](https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html)

<a id="scarfone2008sp800115"></a>Scarfone, K. A., Souppaya, M. P., Cody, A., & Orebaugh, A. D. (2008). *Technical guide to information security testing and assessment* (NIST Special Publication 800-115). National Institute of Standards and Technology. [https://doi.org/10.6028/NIST.SP.800-115](https://doi.org/10.6028/NIST.SP.800-115)

<a id="spdxlicenselist"></a>SPDX Workgroup, The Linux Foundation. (n.d.). *SPDX License List*. Retrieved October 19, 2026, from [https://spdx.org/licenses/](https://spdx.org/licenses/)

<a id="tabassi2023airmf"></a>† Tabassi, E. (2023). *Artificial intelligence risk management framework (AI RMF 1.0)* (NIST AI 100-1). National Institute of Standards and Technology. [https://doi.org/10.6028/NIST.AI.100-1](https://doi.org/10.6028/NIST.AI.100-1)

## Vulnerability advisories and version data

<a id="httpdvulns24"></a>The Apache Software Foundation. (n.d.). *Apache HTTP Server 2.4 vulnerabilities*. Retrieved October 21, 2026, from [https://httpd.apache.org/security/vulnerabilities_24.html](https://httpd.apache.org/security/vulnerabilities_24.html)

<a id="censys2024cve4577"></a>Censys. (2024, June 10). *PHP-CGI argument injection vulnerability could lead to remote code execution*. Retrieved October 21, 2026, from [https://censys.com/advisory/cve-2024-4577/](https://censys.com/advisory/cve-2024-4577/)

<a id="ossfosvschema"></a>Chang, O., & Cox, R. (2026, October 13). *Open source vulnerability format* (Version 1.9.2). OpenSSF. Retrieved October 21, 2026, from [https://ossf.github.io/osv-schema/](https://ossf.github.io/osv-schema/)

<a id="cisakev"></a>Cybersecurity and Infrastructure Security Agency. (n.d.). *Known exploited vulnerabilities catalog*. Retrieved October 21, 2026, from [https://www.cisa.gov/known-exploited-vulnerabilities-catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)

<a id="debiansecurityfaq"></a>Debian Project. (n.d.). *Debian security FAQ*. Retrieved October 21, 2026, from [https://www.debian.org/security/faq](https://www.debian.org/security/faq)

<a id="devcore2024cve4577"></a>DEVCORE. (2024, June 6). *Security alert: CVE-2024-4577 – PHP CGI argument injection vulnerability*. Retrieved October 21, 2026, from [https://devco.re/blog/2024/06/06/security-alert-cve-2024-4577-php-cgi-argument-injection-vulnerability-en/](https://devco.re/blog/2024/06/06/security-alert-cve-2024-4577-php-cgi-argument-injection-vulnerability-en/)

<a id="endoflifedate"></a>endoflife.date contributors. (n.d.). *Endoflife.date*. Retrieved October 21, 2026, from [https://endoflife.date/](https://endoflife.date/)

<a id="gitlab2024cve9596"></a>† GitLab. (2024, October 10). *CVE-2024-9596* [Unauthenticated disclosure of the GitLab version number]. CVE Program. Retrieved October 29, 2026, from [https://www.cve.org/CVERecord?id=CVE-2024-9596](https://www.cve.org/CVERecord?id=CVE-2024-9596)

<a id="gitlab2026patch"></a>† GitLab. (2026, October 21). *GitLab critical patch release: 19.5.1, 19.4.3, 19.3.6, 19.2.9, 19.1.9, 19.0.10, 18.11.13*. GitLab Docs. Retrieved October 29, 2026, from [https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/](https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/)

<a id="jackson2026emudhra"></a>† Jackson, D. (2026, October 18). *eMudhra: Private key compromise of intermediate certificates* [Bug 2083449]. Bugzilla@Mozilla, CA Program :: CA Certificate Compliance. Retrieved October 29, 2026, from [https://bugzilla.mozilla.org/show_bug.cgi?id=2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449)

<a id="li2017largescale"></a>Li, F., & Paxson, V. (2017). A large-scale empirical study of security patches. In *Proceedings of the 2017 ACM SIGSAC Conference on Computer and Communications Security (CCS '17)* (pp. 2201–2215). ACM. [https://doi.org/10.1145/3133956.3134072](https://doi.org/10.1145/3133956.3134072)

<a id="mongodblifecycles"></a>MongoDB, Inc. (n.d.). *Software lifecycle schedules*. MongoDB. Retrieved October 22, 2026, from [https://www.mongodb.com/legal/support-policy/lifecycles](https://www.mongodb.com/legal/support-policy/lifecycles)

<a id="ncscadvisories"></a>Nationaal Cyber Security Centrum. (n.d.). *Security advisories*. Retrieved October 21, 2026, from [https://advisories.ncsc.nl/](https://advisories.ncsc.nl/)

<a id="nginxadvisories"></a>nginx. (n.d.). *Nginx security advisories*. Retrieved October 21, 2026, from [https://nginx.org/en/security_advisories.html](https://nginx.org/en/security_advisories.html)

<a id="nos2026phpliveblog"></a>† NOS. (2026, October 21). *Websites kwetsbaar voor softwarelek: RTL nieuws, DigiD en MijnOverheid uit de lucht* [Websites vulnerable to software flaw: RTL Nieuws, DigiD and MijnOverheid offline]. Retrieved October 21, 2026, from [https://nos.nl/liveblog/2636066-websites-kwetsbaar-voor-softwarelek-digid-en-mijnoverheid-uit-de-lucht](https://nos.nl/liveblog/2636066-websites-kwetsbaar-voor-softwarelek-digid-en-mijnoverheid-uit-de-lucht)

<a id="openai2026php2shell"></a>† OpenAI. (2026b). *php2shell-checker*. GitHub. Retrieved October 29, 2026, from [https://github.com/openai/php2shell-checker/tree/40a4746ec4925d4d7510b99f9e134277918b1ac3](https://github.com/openai/php2shell-checker/tree/40a4746ec4925d4d7510b99f9e134277918b1ac3)

<a id="nodejsreleases"></a>OpenJS Foundation and Node.js contributors. (n.d.). *Node.js releases*. Retrieved October 21, 2026, from [https://nodejs.org/en/about/previous-releases](https://nodejs.org/en/about/previous-releases)

<a id="opensslvulns"></a>OpenSSL Library. (n.d.). *Vulnerabilities*. Retrieved October 21, 2026, from [https://openssl-library.org/news/vulnerabilities/](https://openssl-library.org/news/vulnerabilities/)

<a id="phpsrcadvisories"></a>The PHP Group. (n.d.-b). *Security advisories for php/php-src*. Retrieved October 21, 2026, from [https://github.com/php/php-src/security/advisories](https://github.com/php/php-src/security/advisories)

<a id="phpsupported"></a>The PHP Group. (n.d.-c). *Supported versions*. Retrieved October 21, 2026, from [https://www.php.net/supported-versions.php](https://www.php.net/supported-versions.php)

<a id="php2012cgi"></a>The PHP Group. (2012, May 6). *PHP 5.3.12 and 5.4.2 and the CGI flaw (CVE-2012-1823)*. Retrieved October 21, 2026, from [https://www.php.net/archive/2012.php#id2012-05-06-1](https://www.php.net/archive/2012.php#id2012-05-06-1)

<a id="php2026critical"></a>The PHP Group. (2026, October 20). *Upcoming critical PHP security release*. Retrieved October 21, 2026, from [https://www.php.net/archive/2026.php#2026-10-20-1](https://www.php.net/archive/2026.php#2026-10-20-1)

<a id="pythondevguideversions"></a>Python Software Foundation. (n.d.). *Status of Python versions*. Python Developer's Guide. Retrieved October 21, 2026, from [https://devguide.python.org/versions/](https://devguide.python.org/versions/)

<a id="redhatbackporting"></a>Red Hat. (n.d.). *Security backporting practice*. Red Hat Customer Portal. Retrieved October 21, 2026, from [https://access.redhat.com/security/updates/backporting](https://access.redhat.com/security/updates/backporting)

<a id="ubuntusecurityfaq"></a>Ubuntu Security Team. (n.d.). *Security/FAQ*. Ubuntu Wiki. Retrieved October 21, 2026, from [https://wiki.ubuntu.com/SecurityTeam/FAQ](https://wiki.ubuntu.com/SecurityTeam/FAQ)

<a id="zhang2018precise"></a>Zhang, H., & Qian, Z. (2018). Precise and accurate patch presence test for binaries. In *27th USENIX Security Symposium (USENIX Security 18)* (pp. 887–902). USENIX Association. [https://www.usenix.org/conference/usenixsecurity18/presentation/zhang-hang](https://www.usenix.org/conference/usenixsecurity18/presentation/zhang-hang)

## Research methods and statistics

<a id="sigsoft2026benchmarking"></a>† ACM SIGSOFT Empirical Standards. (n.d.-a). *Benchmarking (of software systems)*. Retrieved October 29, 2026, from [https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/standards/Benchmarking.md](https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/standards/Benchmarking.md)

<a id="sigsoft2026irr"></a>† ACM SIGSOFT Empirical Standards. (n.d.-b). *Inter-rater reliability and agreement*. Retrieved October 29, 2026, from [https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/supplements/InterRaterReliabilityAndAgreement.md](https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/supplements/InterRaterReliabilityAndAgreement.md)

<a id="sigsoft2026registered"></a>† ACM SIGSOFT Empirical Standards. (n.d.-c). *Registered reports*. Retrieved October 29, 2026, from [https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/supplements/RegisteredReports.md](https://github.com/acmsigsoft/EmpiricalStandards/blob/master/docs/supplements/RegisteredReports.md)

<a id="bossuyt2015stard"></a>† Bossuyt, P. M., Reitsma, J. B., Bruns, D. E., Gatsonis, C. A., Glasziou, P. P., Irwig, L., Lijmer, J. G., Moher, D., Rennie, D., de Vet, H. C. W., Kressel, H. Y., Rifai, N., Golub, R. M., Altman, D. G., Hooft, L., Korevaar, D. A., & Cohen, J. F. (2015). STARD 2015: An updated list of essential items for reporting diagnostic accuracy studies. *BMJ*, Article h5527. [https://doi.org/10.1136/bmj.h5527](https://doi.org/10.1136/bmj.h5527)

<a id="cohen1960coefficient"></a>† Cohen, J. (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement*, *20*(1), 37–46. [https://doi.org/10.1177/001316446002000104](https://doi.org/10.1177/001316446002000104)

<a id="efron1979bootstrap"></a>† Efron, B. (1979). Bootstrap methods: Another look at the jackknife. *The Annals of Statistics*, *7*(1), 1–26. [https://doi.org/10.1214/aos/1176344552](https://doi.org/10.1214/aos/1176344552)

<a id="feinstein1990paradoxes"></a>† Feinstein, A. R., & Cicchetti, D. V. (1990). High agreement but low kappa: I. The problems of two paradoxes. *Journal of Clinical Epidemiology*, *43*(6), 543–549. [https://doi.org/10.1016/0895-4356(90)90158-L](https://doi.org/10.1016/0895-4356(90)90158-L)

<a id="field2007bootstrapping"></a>† Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. *Journal of the Royal Statistical Society Series B: Statistical Methodology*, *69*(3), 369–390. [https://doi.org/10.1111/j.1467-9868.2007.00593.x](https://doi.org/10.1111/j.1467-9868.2007.00593.x)

<a id="fleiss1969large"></a>† Fleiss, J. L., Cohen, J., & Everitt, B. S. (1969). Large sample standard errors of kappa and weighted kappa. *Psychological Bulletin*, *72*(5), 323–327. [https://doi.org/10.1037/h0028106](https://doi.org/10.1037/h0028106)

<a id="mcnemar1947note"></a>† McNemar, Q. (1947). Note on the sampling error of the difference between correlated proportions or percentages. *Psychometrika*, *12*(2), 153–157. [https://doi.org/10.1007/BF02295996](https://doi.org/10.1007/BF02295996)

<a id="newcombe1998interval"></a>† Newcombe, R. G. (1998). Interval estimation for the difference between independent proportions: Comparison of eleven methods. *Statistics in Medicine*, *17*(8), 873–890. [https://doi.org/10.1002/(SICI)1097-0258(19980430)17:8<873::AID-SIM779>3.0.CO;2-I](https://doi.org/10.1002/(SICI)1097-0258(19980430)17:8<873::AID-SIM779>3.0.CO;2-I)

<a id="nosek2018preregistration"></a>† Nosek, B. A., Ebersole, C. R., DeHaven, A. C., & Mellor, D. T. (2018). The preregistration revolution. *Proceedings of the National Academy of Sciences*, *115*(11), 2600–2606. [https://doi.org/10.1073/pnas.1708274114](https://doi.org/10.1073/pnas.1708274114)

<a id="petersson2004capture"></a>† Petersson, H., Thelin, T., Runeson, P., & Wohlin, C. (2004). Capture–recapture in software inspections after 10 years research: Theory, evaluation and application. *Journal of Systems and Software*, *72*(2), 249–264. [https://doi.org/10.1016/S0164-1212(03)00090-6](https://doi.org/10.1016/S0164-1212(03)00090-6)

<a id="ralph2021empirical"></a>† Ralph, P., bin Ali, N., Baltes, S., Bianculli, D., Diaz, J., Dittrich, Y., Ernst, N., Felderer, M., Feldt, R., Filieri, A., de França, B. B. N., Furia, C. A., Gay, G., Gold, N., Graziotin, D., He, P., Hoda, R., Juristo, N., Kitchenham, B., . . . Vegas, S. (2021). *Empirical standards for software engineering research* [Preprint]. arXiv. [https://doi.org/10.48550/arXiv.2010.03525](https://doi.org/10.48550/arXiv.2010.03525)

<a id="webber2013recall"></a>† Webber, W. (2013). Approximate recall confidence intervals. *ACM Transactions on Information Systems*, *31*(1), 1–33. [https://doi.org/10.1145/2414782.2414784](https://doi.org/10.1145/2414782.2414784)

<a id="wilson1927probable"></a>† Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. *Journal of the American Statistical Association*, *22*(158), 209–212. [https://doi.org/10.1080/01621459.1927.10502953](https://doi.org/10.1080/01621459.1927.10502953)

<a id="youden1950index"></a>† Youden, W. J. (1950). Index for rating diagnostic tests. *Cancer*, *3*(1), 32–35. [https://doi.org/10.1002/1097-0142(1950)3:1<32::AID-CNCR2820030106>3.0.CO;2-3](https://doi.org/10.1002/1097-0142(1950)3:1<32::AID-CNCR2820030106>3.0.CO;2-3)
