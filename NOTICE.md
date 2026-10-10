# Notices

## Application code
The code and documentation in this repository are released under the MIT License (see [`LICENSE`](LICENSE)).

## Scripture text

### Douay-Rheims (included: `data/douay-rheims.json`)
- **Text:** the Douay-Rheims Bible, Challoner revision (1749–1752). It is in the **public domain**.
- **Digitization:** this text was digitized by [Project Gutenberg](https://www.gutenberg.org/ebooks/8300) (eBook #8300). We credit them here as the source. The data file itself carries no Project Gutenberg branding or license header, in line with the [Project Gutenberg license](https://www.gutenberg.org/policy/license.html).
- **Footnotes:** Bishop Challoner's annotations (18th century), which are also public domain, come from the same source.
- **JSON structure:** adapted from [isaacronan/douay-rheims-json](https://github.com/isaacronan/douay-rheims-json), used under the MIT License below. We converted it to one file keyed by USFM book codes, split each annotation into the phrase it comments on and its text, trimmed stray characters, and renumbered by position the 12 chapters whose source verse numbers were duplicated.

```
MIT License

Copyright (c) 2021 isaacronan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### New American Bible, Revised Edition (NOT included)
The NABRE is © 2010, 1991, 1986, 1970 Confraternity of Christian Doctrine (CCD), Washington, D.C. All rights reserved. The text is **not** part of this repository and must never be committed to it. The USCCB states that digital applications require a license from CCD ([permissions](https://www.usccb.org/offices/new-american-bible/permissions)). The app can load an NABRE text only into a privately deployed database, and only under a license or written permission from CCD. When it does, it displays the notice CCD requires.

## Fonts
Inter and Literata are loaded through `next/font/google` and are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

## Dependencies
npm dependencies keep their own licenses. See `package-lock.json` and each package's `LICENSE`.
