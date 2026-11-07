import { Fragment } from 'react';
import { BASE_PATH, SIDEBAR_GROUPS } from '../navigation';

function toHref(link: string) {
  return link.startsWith('http') ? link : `${BASE_PATH}${link.replace(/^\//, '')}`;
}

/**
 * 首页目录与侧栏共用 src/navigation.ts 的同一份数据。
 * 新增页面只改 navigation.ts，侧栏与首页同时生效。
 * 标记 data-v / data-v-link 与 Vocs 的 Markdown 输出一致，prose 样式才会命中。
 */
export function PageDirectory() {
  return (
    <>
      {SIDEBAR_GROUPS.filter((group) => group.text !== '前言' && group.items.length > 0).map(
        (group) => (
          <Fragment key={group.text}>
            <h2 data-v="">{group.text}</h2>
            <p data-v="">
              {group.items.map((item, index) => (
                <Fragment key={item.link}>
                  {index > 0 ? ' · ' : null}
                  <a data-v="" data-v-link="true" href={toHref(item.link)}>
                    {item.text}
                  </a>
                </Fragment>
              ))}
            </p>
          </Fragment>
        ),
      )}
    </>
  );
}
