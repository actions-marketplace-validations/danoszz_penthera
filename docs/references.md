# References

The research and standards Penthera's methodology and findings cite. The BibTeX source is [references.bib](references.bib); this page is generated from it by `node scripts/build-references.mjs`.

Every entry was checked against the publisher or standards body (Crossref DOI metadata, USENIX, NDSS, arXiv, the RFC Editor, OWASP, MITRE, OASIS, the EU Publications Office) on 2026-10-19. Entries that could not be verified were left out. How each one is used is described in [METHODOLOGY.md](METHODOLOGY.md).

## Black-box scanning and benchmarking

- `bau2010state`: Bau, Jason; Bursztein, Elie; Gupta, Divij; Mitchell, John (2010). *State of the Art: Automated Black-Box Web Application Vulnerability Testing*. 2010 IEEE Symposium on Security and Privacy. <https://doi.org/10.1109/SP.2010.27>
- `doupe2010johnny`: Doupé, Adam; Cova, Marco; Vigna, Giovanni (2010). *Why Johnny Can't Pentest: An Analysis of Black-Box Web Vulnerability Scanners*. Detection of Intrusions and Malware, and Vulnerability Assessment (DIMVA 2010). <https://doi.org/10.1007/978-3-642-14215-4_7>
- `antunes2010benchmarking`: Antunes, Nuno; Vieira, Marco (2010). *Benchmarking Vulnerability Detection Tools for Web Services*. 2010 IEEE International Conference on Web Services (ICWS). <https://doi.org/10.1109/ICWS.2010.76>
- `antunes2015assessing`: Antunes, Nuno; Vieira, Marco (2015). *Assessing and Comparing Vulnerability Detection Tools for Web Services: Benchmarking Approach and Examples*. IEEE Transactions on Services Computing. <https://doi.org/10.1109/TSC.2014.2310221>
- `owaspbenchmark`: OWASP Foundation. *OWASP Benchmark Project*. OWASP project page (v1.2; project leader Dave Wichers). <https://owasp.org/www-project-benchmark/>

## Security design principles

- `saltzer1975protection`: Saltzer, J. H.; Schroeder, M. D. (1975). *The Protection of Information in Computer Systems*. Proceedings of the IEEE. <https://doi.org/10.1109/PROC.1975.9939>

## Threat modeling

- `shostack2014threat`: Shostack, Adam (2014). *Threat Modeling: Designing for Security*. Wiley. <https://www.wiley-vch.de/de/fachgebiete/computer-und-informatik/threat-modeling-978-1-118-80999-0>
- `kohnfelder1999threats`: Kohnfelder, Loren; Garg, Praerit (1999). *The Threats to Our Products*. Microsoft internal Interface journal, 1 April 1999; copy hosted by Adam Shostack. <https://shostack.org/files/microsoft/The-Threats-To-Our-Products.docx>

## Software supply chain

- `ladisa2023sok`: Ladisa, Piergiorgio; Plate, Henrik; Martinez, Matias; Barais, Olivier (2023). *SoK: Taxonomy of Attacks on Open-Source Software Supply Chains*. 2023 IEEE Symposium on Security and Privacy (SP). <https://doi.org/10.1109/SP46215.2023.10179304>
- `ohm2020backstabber`: Ohm, Marc; Plate, Henrik; Sykosch, Arnold; Meier, Michael (2020). *Backstabber's Knife Collection: A Review of Open Source Software Supply Chain Attacks*. Detection of Intrusions and Malware, and Vulnerability Assessment (DIMVA 2020). <https://doi.org/10.1007/978-3-030-52683-2_2>
- `zimmermann2019small`: Zimmermann, Markus; Staicu, Cristian-Alexandru; Tenny, Cam; Pradel, Michael (2019). *Small World with High Risks: A Study of Security Threats in the npm Ecosystem*. 28th USENIX Security Symposium (USENIX Security 19). <https://www.usenix.org/conference/usenixsecurity19/presentation/zimmerman>
- `lauinger2017thou`: Lauinger, Tobias; Chaabane, Abdelberi; Arshad, Sajjad; Robertson, William; Wilson, Christo; Kirda, Engin (2017). *Thou Shalt Not Depend on Me: Analysing the Use of Outdated JavaScript Libraries on the Web*. Network and Distributed System Security Symposium (NDSS 2017). <https://doi.org/10.14722/ndss.2017.23414>
- `thompson1984reflections`: Thompson, Ken (1984). *Reflections on Trusting Trust*. Communications of the ACM. <https://doi.org/10.1145/358198.358210>
- `torresarias2019intoto`: Torres-Arias, Santiago; Afzali, Hammad; Kuppusamy, Trishank Karthik; Curtmola, Reza; Cappos, Justin (2019). *in-toto: Providing farm-to-table guarantees for bits and bytes*. 28th USENIX Security Symposium (USENIX Security 19). <https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias>
- `samuel2010survivable`: Samuel, Justin; Mathewson, Nick; Cappos, Justin; Dingledine, Roger (2010). *Survivable Key Compromise in Software Update Systems*. Proceedings of the 17th ACM Conference on Computer and Communications Security (CCS '10). <https://doi.org/10.1145/1866307.1866315>

## Secret leakage

- `meli2019bad`: Meli, Michael; McNiece, Matthew R.; Reaves, Bradley (2019). *How Bad Can It Git? Characterizing Secret Leakage in Public GitHub Repositories*. Network and Distributed System Security Symposium (NDSS 2019). <https://doi.org/10.14722/ndss.2019.23418>
- `basak2023secretbench`: Basak, Setu Kumar; Neil, Lorenzo; Reaves, Bradley; Williams, Laurie (2023). *SecretBench: A Dataset of Software Secrets*. 2023 IEEE/ACM 20th International Conference on Mining Software Repositories (MSR). <https://doi.org/10.1109/MSR59073.2023.00053>

## Web application security

- `weichselbaum2016csp`: Weichselbaum, Lukas; Spagnuolo, Michele; Lekies, Sebastian; Janc, Artur (2016). *CSP Is Dead, Long Live CSP! On the Insecurity of Whitelists and the Future of Content Security Policy*. Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16). <https://doi.org/10.1145/2976749.2978363>
- `kocher1996timing`: Kocher, Paul C. (1996). *Timing Attacks on Implementations of Diffie-Hellman, RSA, DSS, and Other Systems*. Advances in Cryptology - CRYPTO '96. <https://doi.org/10.1007/3-540-68697-5_9>
- `crosby2009opportunities`: Crosby, Scott A.; Wallach, Dan S.; Riedi, Rudolf H. (2009). *Opportunities and Limits of Remote Timing Attacks*. ACM Transactions on Information and System Security. <https://doi.org/10.1145/1455526.1455530>
- `lekies2013flows`: Lekies, Sebastian; Stock, Ben; Johns, Martin (2013). *25 Million Flows Later: Large-scale Detection of DOM-based XSS*. Proceedings of the 2013 ACM SIGSAC Conference on Computer and Communications Security (CCS '13). <https://doi.org/10.1145/2508859.2516703>
- `stock2014precise`: Stock, Ben; Lekies, Sebastian; Mueller, Tobias; Spiegel, Patrick; Johns, Martin (2014). *Precise Client-side Protection against DOM-based Cross-Site Scripting*. 23rd USENIX Security Symposium (USENIX Security 14). <https://www.usenix.org/conference/usenixsecurity14/technical-sessions/presentation/stock>
- `barth2008robust`: Barth, Adam; Jackson, Collin; Mitchell, John C. (2008). *Robust Defenses for Cross-Site Request Forgery*. Proceedings of the 15th ACM Conference on Computer and Communications Security (CCS '08). <https://doi.org/10.1145/1455770.1455782>
- `fett2016comprehensive`: Fett, Daniel; Küsters, Ralf; Schmitz, Guido (2016). *A Comprehensive Formal Security Analysis of OAuth 2.0*. Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16). <https://doi.org/10.1145/2976749.2978385>
- `hodges2012rfc6797`: Hodges, J.; Jackson, C.; Barth, A. (2012). *HTTP Strict Transport Security (HSTS)*. RFC 6797, Proposed Standard, RFC Editor. <https://doi.org/10.17487/RFC6797>
- `jones2015rfc7519`: Jones, M.; Bradley, J.; Sakimura, N. (2015). *JSON Web Token (JWT)*. RFC 7519, Proposed Standard, RFC Editor. <https://doi.org/10.17487/RFC7519>
- `sakimura2015rfc7636`: Sakimura, N.; Bradley, J.; Agarwal, N. (2015). *Proof Key for Code Exchange by OAuth Public Clients*. RFC 7636, Proposed Standard, RFC Editor. <https://doi.org/10.17487/RFC7636>
- `lodderstedt2025rfc9700`: Lodderstedt, T.; Bradley, J.; Labunets, A.; Fett, D. (2025). *Best Current Practice for OAuth 2.0 Security*. RFC 9700, BCP 240, RFC Editor. <https://doi.org/10.17487/RFC9700>
- `chen2018cors`: Chen, Jianjun; Jiang, Jian; Duan, Haixin; Wan, Tao; Chen, Shuo; Paxson, Vern; Yang, Min (2018). *We Still Don't Have Secure Cross-Domain Requests: an Empirical Study of CORS*. 27th USENIX Security Symposium (USENIX Security 18). <https://www.usenix.org/conference/usenixsecurity18/presentation/chen-jianjun>
- `sheffer2020rfc8725`: Sheffer, Y.; Hardt, D.; Jones, M. (2020). *JSON Web Token Best Current Practices*. RFC 8725, BCP 225, RFC Editor. <https://doi.org/10.17487/RFC8725>
- `owasp2023api`: OWASP Foundation (2023). *OWASP Top 10 API Security Risks - 2023*. OWASP API Security Project. <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- `kitterman2014rfc7208`: Kitterman, S. (2014). *Sender Policy Framework (SPF) for Authorizing Use of Domains in Email, Version 1*. RFC 7208, Proposed Standard, RFC Editor. <https://doi.org/10.17487/RFC7208>
- `kucherawy2015rfc7489`: Kucherawy, M.; Zwicky, E. (2015). *Domain-based Message Authentication, Reporting, and Conformance (DMARC)*. RFC 7489, Informational, RFC Editor. <https://doi.org/10.17487/RFC7489>
- `owasp2021top10`: OWASP Foundation (2021). *OWASP Top 10:2021*. OWASP Foundation. <https://top10.owasp.org/2021>
- `owasp2025top10`: OWASP Foundation (2025). *OWASP Top 10:2025*. OWASP Foundation. <https://top10.owasp.org/2025>
- `owaspwstg42`: OWASP Foundation. *OWASP Web Security Testing Guide, Version 4.2*. OWASP Foundation. <https://wstg.owasp.org/v4.2/>

## LLM and agent security

- `greshake2023signed`: Greshake, Kai; Abdelnabi, Sahar; Mishra, Shailesh; Endres, Christoph; Holz, Thorsten; Fritz, Mario (2023). *Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection*. Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security (AISec '23). <https://doi.org/10.1145/3605764.3623985>
- `spracklen2025package`: Spracklen, Joseph; Wijewickrama, Raveen; Sakib, A H M Nazmus; Maiti, Anindya; Viswanath, Bimal; Jadliwala, Murtuza (2025). *We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs*. 34th USENIX Security Symposium (USENIX Security 25). <https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen>
- `perez2022ignore`: Perez, Fábio; Ribeiro, Ian (2022). *Ignore Previous Prompt: Attack Techniques For Language Models*. NeurIPS 2022 ML Safety Workshop; arXiv:2211.09527. <https://doi.org/10.48550/arXiv.2211.09527>
- `liu2023prompt`: Liu, Yi; Deng, Gelei; Li, Yuekang; Wang, Kailong; Wang, Zihao; Wang, Xiaofeng; Zhang, Tianwei; Liu, Yepang; Wang, Haoyu; Zheng, Yan; Zhang, Leo Yu; Liu, Yang (2023). *Prompt Injection attack against LLM-integrated Applications*. arXiv preprint arXiv:2306.05499. <https://doi.org/10.48550/arXiv.2306.05499>
- `owasp2024llmtop10`: OWASP Foundation (2024). *OWASP Top 10 for LLM Applications 2025*. OWASP Gen AI Security Project, published 17 November 2024. <https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/>
- `owasp2025agentic`: OWASP Foundation (2025). *OWASP Top 10 for Agentic Applications for 2026*. OWASP Gen AI Security Project, published 9 December 2025. <https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/>
- `owasp2025mcptop10`: OWASP Foundation (2025). *OWASP MCP Top 10*. OWASP project page (beta, living document; items MCP01:2025-MCP10:2025; project lead Vandana Verma Sehgal). <https://owasp.org/www-project-mcp-top-10/>
- `mitreatlas`: The MITRE Corporation. *MITRE ATLAS: Adversarial Threat Landscape for AI Systems*. Knowledge base of adversary tactics and techniques against AI systems. <https://atlas.mitre.org/>

## Standards and regulation

- `scarfone2008sp800115`: Scarfone, K. A.; Souppaya, M. P.; Cody, A.; Orebaugh, A. D. (2008). *Technical Guide to Information Security Testing and Assessment*. National Institute of Standards and Technology. <https://doi.org/10.6028/NIST.SP.800-115>
- `oasis2023sarif`: Fanning, Michael C.; Golding, Laurence J. (2023). *Static Analysis Results Interchange Format (SARIF) Version 2.1.0 Plus Errata 01*. OASIS Standard incorporating Approved Errata, 28 August 2023. <https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html>
- `eu2022nis2`: European Parliament; Council of the European Union (2022). *Directive (EU) 2022/2555 of the European Parliament and of the Council of 14 December 2022 on measures for a high common level of cybersecurity across the Union, amending Regulation (EU) No 910/2014 and Directive (EU) 2018/1972, and repealing Directive (EU) 2016/1148 (NIS 2 Directive)*. Official Journal of the European Union, L 333, 27.12.2022, p. 80. <https://eur-lex.europa.eu/eli/dir/2022/2555/oj>
- `mitrecwe`: The MITRE Corporation. *CWE: Common Weakness Enumeration*. Community-developed list of software and hardware weakness types, sponsored by CISA. <https://cwe.mitre.org/>
