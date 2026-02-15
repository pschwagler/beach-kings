/**
 * Reusable JSON-LD structured data component.
 * Renders a <script type="application/ld+json"> tag for search engine rich results.
 *
 * @param {Object} props.data - The structured data object (schema.org format)
 */
export default function JsonLd({ data }) {
  // Escape </script> to prevent XSS breakout from user-controlled data
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
