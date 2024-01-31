# sQratchpad

I often need a quick no-frills editor to compose text to be used elsewhere, like in a DM, a commit message, or a Mastodon post. Existing tools aren't great:

- The gist editor in Github gives up PII to Microsoft and takes too long to load
- CLI editors like Emacs and vi require you to open a console window
- A full word processor like Word or GDocs takes forever to start up
- Composing an email draft distracts you with your inbox. Ditto a Slack, Discord, whatever editor. Too much distraction.

The app I'm building in this project:

- Has zero privacy loss. There are no cookies and no logs.
- Starts up superfast.
- Gets you right into the edit box with no extra steps
- Helps you focus instead of distracting you.

Demo: https://planckscratchpad.xyz

## Installation

<pre>git clone https://github.com/lucasgonze/sQratchpad
git submodule update --init --recursive</pre>

## Thanks and Praise and Copyright

plank-scratchpad is under [version 2 of the Apache Public License](LICENSE.txt).

### css

The readability of the text comes from inclusion of the [hello-css](https://github.com/arp242/hello-css) project by Martin Tournoij. His license statement:

> I renounce all copyright, and don’t care what you do with it. Since this is not possible in all legal jurisdictions I’ve also attached a modified copy of the ISC license which replaces the attribution clause with the text “without any restrictions”:

        Copyright © Martin Tournoij

        Permission to use, copy, modify, and/or distribute this software for any purpose
        with or without fee is hereby granted, without any restrictions.

        THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
        REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
        FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
        INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
        OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
        TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
        THIS SOFTWARE.


### font

The [Libre Baskerville font](https://github.com/impallari/Libre-Baskerville) in
the hello-css fonts directory is distributed under [the SIL Open Font License 1.1](https://scripts.sil.org/cms/scripts/page.php?item_id=OFL-FAQ_web). 

The fleurons in the &lt;hr&gt; element are exports from the Deja-Vu font, which
is in the public domain.

