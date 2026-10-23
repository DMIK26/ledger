import { Fragment, type ReactNode } from 'react';
import { tl } from '../domain/i18n';

/**
 * A translated sentence with parts that are not plain text, such as amounts, links or bold names:
 * `tr('{0} left of {1}', <Money …/>, <Money …/>)`. The translation may reorder the parts.
 */
export function tr(text: string, ...parts: readonly ReactNode[]): ReactNode {
  const pieces = tl(text).split(/\{(\d+)\}/);
  return pieces.map((piece, i) =>
    i % 2 === 0 ? (
      piece === '' ? null : (
        <Fragment key={i}>{piece}</Fragment>
      )
    ) : (
      <Fragment key={i}>{parts[Number(piece)]}</Fragment>
    ),
  );
}
