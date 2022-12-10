import ThumbUpIcon from '@material-ui/icons/ThumbUp';
import ThumbDownIcon from '@material-ui/icons/ThumbDown';
import ReplyIcon from '@mui/icons-material/Reply';
import FlagIcon from '@material-ui/icons/Flag';
import React from "react";
import {ParticipantProgress} from "../../components/ParticipantProgress";
import {GameIntroductionScreen, replaceHTMLPlaceholder} from "./GameIntroduction";
import {ExampleCommentEntryBox} from "./CommentEntry";


/**
 * The page that is shown to explain the rules of the game to participants.
 */
export class GameRules extends GameIntroductionScreen {
    getContent(study) {
        let rulesHTML = study.pagesSettings.rules;

        const like = <ThumbUpIcon className="text-gray-700 mr-2" key="like" />;
        const dislike = <ThumbDownIcon className="text-gray-700 mr-2" key="dislike" />;
        const share = (
            <span className="inline-block transform scale-125" key="share">
                <ReplyIcon className="text-gray-700 mr-2 transform flip-x -translate-y-0.5 -scale-x-1"
                           style={{fontSize: "1.7rem"}}/>
            </span>
        );
        const flag = <FlagIcon key="flag" className="text-gray-700 mr-2"
                               style={{fontSize: "1.6rem", marginLeft: "-0.15rem", marginTop: "-0.15rem"}} />;

        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{LIKE}}", () => like).content;
        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{DISLIKE}}", () => dislike).content;
        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{SHARE}}", () => share).content;
        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{FLAG}}", () => flag).content;

        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{ENABLED-POST-REACTIONS}}", () => {
            const postEnabledReactions = study.getPostEnabledReactions();

            let content;
            if (postEnabledReactions.length > 0) {
                const buttons = [];
                if (postEnabledReactions.includes("like")) {
                    buttons.push(like);
                }
                if (postEnabledReactions.includes("dislike")) {
                    buttons.push(dislike);
                }
                if (postEnabledReactions.includes("share")) {
                    buttons.push(share);
                }
                if (postEnabledReactions.includes("flag")) {
                    buttons.push(flag);
                }
                content = <>
                    <div>{buttons}</div>
                    <span className="text-gray-700" style={{marginTop: "0.1rem"}} key="skip">
                        Skip Post
                    </span>
                </>;
            } else {
                content = <span className="italic">There are no enabled reactions for posts</span>;
            }
            return <div className="inline-block w-full mb-2">
                <div className="w-full flex justify-between max-w-xs px-3 py-1 mt-4
                                   rounded-md shadow border border-gray-400">
                    {content}
                </div>
            </div>;
        }).content;

        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{ENABLED-COMMENT-REACTIONS}}", () => {
            const postEnabledReactions = study.getCommentEnabledReactions();

            let content;
            if (postEnabledReactions.length > 0) {
                const buttons = [];
                if (postEnabledReactions.includes("like")) {
                    buttons.push(like);
                }
                if (postEnabledReactions.includes("dislike")) {
                    buttons.push(dislike);
                }
                if (postEnabledReactions.includes("share")) {
                    buttons.push(share);
                }
                if (postEnabledReactions.includes("flag")) {
                    buttons.push(flag);
                }
                content = <>
                    {buttons}
                </>;
            } else {
                content = <span className="italic">There are no enabled reactions for comments</span>;
            }
            return <div className="inline-block w-full mb-2">
                <div className="inline-block pr-2 pl-3 py-1 mt-4 rounded-md shadow border border-gray-400">
                    {content}
                </div>
            </div>;
        }).content;

        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{COMMENT-ENTRY-EXAMPLE}}", () => {
            return <ExampleCommentEntryBox />;
        }).content;

        rulesHTML = replaceHTMLPlaceholder(rulesHTML, "{{YOUR-PROGRESS-EXAMPLE}}", () => {
            return <div className="inline-block w-full mb-2">
                <ParticipantProgress
                    displayFollowers={study.uiSettings.displayFollowers}
                    displayCredibility={study.uiSettings.displayCredibility}
                    displayProgress = {study.uiSettings.displayProgress}
                    overrideFollowers={13}
                    overrideCredibility={56}
                    hideTooltip={true}
                    nextPostText="Continue to Next Post"
                    onNextPost={() => {}}
                    nextPostEnabled={false}
                    progressPercentage = {0} />
            </div>;
        }).content;

        return rulesHTML;
    }

    getTarget(study) {
        return "/study/" + study.id + "/post-intro";
    }

    getContinueDelaySeconds(study) {
        return study.pagesSettings.rulesDelaySeconds;
    }
}
