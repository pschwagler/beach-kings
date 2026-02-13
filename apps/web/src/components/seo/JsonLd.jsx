/**
 * Reusable JSON-LD structured data component.
 * Renders a <script type="application/ld+json"> tag for search engine rich results.
 *
 * @param {Object} props.data - The structured data object (schema.org format)
 */
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
