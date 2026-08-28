/* NYC Fintech Women — admin: page-type and block-type registries.
 *
 * Adding a new page type = one entry in WIF_TYPES plus its page builder.
 * Adding a new block type = one entry in BLOCK_FIELDS (form) and one in
 * WIF_TEMPLATES.BLOCK_RENDERERS (output). Nothing else changes.
 */
(function () {
  'use strict';

  var T = window.WIF_TEMPLATES;

  /* ------------------------------------------------------------ FFF fields */

  var FFF_FIELDS = [
    { key: 'name', label: 'Name', type: 'text', required: true,
      placeholder: 'Shira Amrany', help: 'Drives the slug and the filename.' },
    { key: 'slug', label: 'Slug', type: 'text', required: true, mono: true,
      prefix: 'fff-', suffix: '.html',
      help: 'Auto-filled from the name. Edit it and it stops following.' },
    { key: 'title', label: 'Post title', type: 'text', required: true,
      placeholder: 'FinTech Female Fridays: Meet Shira Amrany',
      help: 'Leave blank to use “FinTech Female Fridays: Meet {name}”.' },
    { key: 'tag', label: 'Tag / category', type: 'text',
      placeholder: 'Fintech Female Fridays',
      help: 'The uppercase chip above the headline and on the cards.' },
    { key: 'role', label: 'Title / role', type: 'text',
      placeholder: 'Data & Analytics Lead' },
    { key: 'company', label: 'Company', type: 'text', placeholder: 'Indagari' },
    { key: 'linkedin', label: 'LinkedIn URL', type: 'url',
      placeholder: 'https://www.linkedin.com/in/…' },
    { key: 'author', label: 'Interviewed by', type: 'text',
      placeholder: 'Manvir Singh' },
    { key: 'date', label: 'Publish date', type: 'text', placeholder: 'Jul 10',
      help: 'Displayed as typed, matching the existing cards.' },
    { key: 'isoDate', label: 'ISO date', type: 'date',
      help: 'Machine-readable date for SEO only. Not displayed.' },
    { key: 'readTime', label: 'Read time', type: 'text', placeholder: '4 min' },
    { key: 'intro', label: 'Intro / hook', type: 'textarea', rows: 6, required: true,
      placeholder: 'The opening paragraph that runs above the interview…',
      help: 'Also the default source for the card excerpt and meta description.' },
    { key: 'excerpt', label: 'Card excerpt', type: 'textarea', rows: 3,
      help: 'Optional. Blank = first ~240 characters of the intro.' },
    { key: 'metaDescription', label: 'Meta description', type: 'textarea', rows: 2,
      maxlength: 200,
      help: 'Optional. Blank = first ~155 characters of the intro.' },
    { key: 'ogTitle', label: 'Social (OG) title', type: 'text',
      help: 'Optional. Blank = post title.' },
    { key: 'ogImage', label: 'Social (OG) image', type: 'text',
      help: 'Optional. Blank = the cover image. Emitted as an absolute URL.' }
  ];

  /* ------------------------------------------------------------ block form */

  var BLOCK_LABELS = {
    qa: 'Q & A',
    heading: 'Heading',
    paragraph: 'Paragraph',
    quote: 'Pull quote',
    image: 'Image',
    list: 'List'
  };

  var BLOCK_FIELDS = {
    qa: [
      { key: 'q', label: 'Question', control: 'textarea', rows: 2 },
      { key: 'a', label: 'Answer', control: 'textarea', rows: 6 }
    ],
    heading: [
      { key: 'text', label: 'Heading', control: 'text' }
    ],
    paragraph: [
      { key: 'text', label: 'Text', control: 'textarea', rows: 6,
        help: 'Blank line = new paragraph.' }
    ],
    quote: [
      { key: 'text', label: 'Quote', control: 'textarea', rows: 3 },
      { key: 'attrib', label: 'Attribution', control: 'text' }
    ],
    image: [
      { key: 'src', label: 'Path', control: 'text', placeholder: 'images/…' },
      { key: 'alt', label: 'Alt text', control: 'text' },
      { key: 'caption', label: 'Caption', control: 'text' }
    ],
    list: [
      { key: 'items', label: 'Items (one per line)', control: 'lines', rows: 5 },
      { key: 'ordered', label: 'Numbered', control: 'checkbox' }
    ]
  };

  function blankBlock(type) {
    var block = { type: type, id: 'b' + Math.random().toString(36).slice(2, 9) };
    (BLOCK_FIELDS[type] || []).forEach(function (field) {
      if (field.control === 'checkbox') block[field.key] = false;
      else if (field.control === 'lines') block[field.key] = [];
      else block[field.key] = '';
    });
    return block;
  }

  /* ------------------------------------------------------------- page type */

  window.WIF_TYPES = {
    fff: {
      label: 'Fintech Female Fridays',
      fields: FFF_FIELDS,
      blocks: ['qa', 'heading', 'paragraph', 'quote', 'image', 'list'],
      filename: function (m) { return T.postFilename(m); },
      buildPage: function (m) { return T.buildPostPage(m); },
      previewPage: function (m, blobUrl) { return T.previewHtml(m, blobUrl); },
      snippets: function (m) {
        return [
          {
            label: 'Featured card',
            note: 'Replaces the <a class="feature"> block in fintech-female-fridays.html.',
            code: T.featuredCard(m)
          },
          {
            label: 'Grid card',
            note: 'Goes at the top of .blog-grid in fintech-female-fridays.html.',
            code: T.gridCard(m)
          },
          {
            label: 'Homepage card',
            note: 'Top of the #fff card stack in index.html. Inline styles: index.html does not link site.css.',
            code: T.homeCard(m)
          }
        ];
      }
    }
  };

  window.WIF_TYPES_META = {
    BLOCK_LABELS: BLOCK_LABELS,
    BLOCK_FIELDS: BLOCK_FIELDS,
    blankBlock: blankBlock
  };
})();
