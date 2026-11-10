import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Comparison } from "./widgets/Comparison";
import { DaysRange } from "./widgets/DaysRange";
import { IntegerWidths } from "./widgets/IntegerWidths";
import { Packing } from "./widgets/Packing";
import { WhoSeesWhat } from "./widgets/WhoSeesWhat";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    Card,
    Cards,
    File,
    Files,
    Folder,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    Comparison,
    DaysRange,
    IntegerWidths,
    Packing,
    WhoSeesWhat,
    ...components,
  };
}
