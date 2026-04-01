using System.Text.Json;
using System.Text.Json.Serialization;
using osu.Game.Beatmaps;
using osu.Game.Online.API;
using osu.Game.Rulesets;
using osu.Game.Rulesets.Difficulty;
using osu.Game.Rulesets.Mods;
using osu.Game.Rulesets.Osu;
using osu.Game.Rulesets.Osu.Difficulty;
using osu.Game.Rulesets.Osu.Scoring;
using osu.Game.Rulesets.Scoring;
using osu.Game.Scoring;
using osu.Game.Utils;

namespace TosuOfficialPP;

internal static class Program
{
    private static readonly JsonSerializerOptions jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly Dictionary<string, CachedBeatmap> cache = new(StringComparer.Ordinal);
    private static readonly OsuRuleset ruleset = new();
    private static readonly AssemblyRulesetStore rulesetStore = new();

    static Program()
    {
        osu.Game.Beatmaps.Formats.Decoder.RegisterDependencies(rulesetStore);
    }

    public static int Main()
    {
        string? line;

        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            RpcResponse response;

            try
            {
                RpcRequest request = JsonSerializer.Deserialize<RpcRequest>(line, jsonOptions)
                                     ?? throw new InvalidOperationException("Failed to deserialize request.");

                object? result = request.Method switch
                {
                    "prepare_beatmap" => prepareBeatmap(readParams<PrepareBeatmapParams>(request.Params)),
                    "calculate_performances" => calculatePerformances(readParams<CalculatePerformancesParams>(request.Params)),
                    _ => throw new InvalidOperationException($"Unknown method `{request.Method}`.")
                };

                response = new RpcResponse(request.Id, result, null);
            }
            catch (Exception exc)
            {
                response = new RpcResponse(string.Empty, null, new RpcError(exc.Message));
            }

            Console.WriteLine(JsonSerializer.Serialize(response, jsonOptions));
            Console.Out.Flush();
        }

        return 0;
    }

    private static T readParams<T>(JsonElement element)
    {
        return element.Deserialize<T>(jsonOptions)
               ?? throw new InvalidOperationException("Failed to deserialize request params.");
    }

    private static PrepareBeatmapResult prepareBeatmap(PrepareBeatmapParams parameters)
    {
        if (!File.Exists(parameters.MapPath))
            throw new FileNotFoundException($"Beatmap not found: {parameters.MapPath}");

        Mod[] mods = buildMods(parameters.Mods, parameters.IsLazer);
        var workingBeatmap = new FlatWorkingBeatmap(parameters.MapPath);

        var calculator = ruleset.CreateDifficultyCalculator(workingBeatmap);
        var fullAttributes = (OsuDifficultyAttributes)calculator.Calculate(mods);
        List<TimedDifficultyAttributes> timedAttributes = calculator.CalculateTimed(mods);

        BeatmapDifficulty adjustedDifficulty =
            ruleset.GetAdjustedDisplayDifficulty(workingBeatmap.BeatmapInfo, mods);
        double clockRate = ModUtils.CalculateRateWithMods(mods);

        var hitWindows = new OsuHitWindows();
        hitWindows.SetDifficulty(adjustedDifficulty.OverallDifficulty);

        var entry = new CachedBeatmap(
            parameters.IsLazer,
            workingBeatmap,
            mods,
            fullAttributes,
            timedAttributes
        );

        cache[parameters.CacheKey] = entry;

        return new PrepareBeatmapResult(
            OsuDifficultyCalculator.CalculateRateAdjustedApproachRate(
                adjustedDifficulty.ApproachRate,
                clockRate
            ),
            adjustedDifficulty.CircleSize,
            adjustedDifficulty.DrainRate,
            OsuDifficultyCalculator.CalculateRateAdjustedOverallDifficulty(
                adjustedDifficulty.OverallDifficulty,
                clockRate
            ),
            hitWindows.WindowFor(HitResult.Great) / clockRate,
            fullAttributes.HitCircleCount,
            fullAttributes.SliderCount,
            fullAttributes.SpinnerCount,
            fullAttributes.MaxCombo,
            fullAttributes.StarRating,
            fullAttributes.AimDifficulty,
            fullAttributes.SpeedDifficulty,
            fullAttributes.FlashlightDifficulty,
            fullAttributes.SliderFactor
        );
    }

    private static IReadOnlyList<PerformanceResult> calculatePerformances(
        CalculatePerformancesParams parameters
    )
    {
        if (!cache.TryGetValue(parameters.CacheKey, out CachedBeatmap? entry))
            throw new InvalidOperationException(
                $"Beatmap cache `{parameters.CacheKey}` is not prepared."
            );

        PerformanceCalculator calculator =
            ruleset.CreatePerformanceCalculator()
            ?? throw new InvalidOperationException("Osu performance calculator is unavailable.");

        var results = new List<PerformanceResult>(parameters.Scores.Count);

        foreach (ScoreRequestDto score in parameters.Scores)
        {
            OsuDifficultyAttributes attributes = entry.FullAttributes;

            if (score.PassedObjects is > 0 && entry.TimedAttributes.Count > 0)
            {
                int index = Math.Clamp(score.PassedObjects.Value - 1, 0, entry.TimedAttributes.Count - 1);
                attributes = (OsuDifficultyAttributes)entry.TimedAttributes[index].Attributes;
            }

            var scoreInfo = new ScoreInfo(entry.WorkingBeatmap.BeatmapInfo, ruleset.RulesetInfo)
            {
                Accuracy = score.Accuracy,
                MaxCombo = score.Combo
            };

            scoreInfo.Mods = entry.Mods.Select(mod => mod.DeepClone()).ToArray();
            scoreInfo.Statistics = buildStatistics(score.Statistics);

            var performance = (OsuPerformanceAttributes)calculator.Calculate(scoreInfo, attributes);

            results.Add(
                new PerformanceResult(
                    attributes.StarRating,
                    performance.Total,
                    performance.Accuracy,
                    performance.Aim,
                    performance.Flashlight,
                    performance.Speed
                )
            );
        }

        return results;
    }

    private static Dictionary<HitResult, int> buildStatistics(StatisticsDto statistics)
    {
        var result = new Dictionary<HitResult, int>
        {
            [HitResult.Great] = statistics.Great,
            [HitResult.Ok] = statistics.Ok,
            [HitResult.Meh] = statistics.Meh,
            [HitResult.Miss] = statistics.Miss
        };

        addIfNonZero(result, HitResult.Perfect, statistics.Perfect);
        addIfNonZero(result, HitResult.Good, statistics.Good);
        addIfNonZero(result, HitResult.SmallTickHit, statistics.SmallTickHit);
        addIfNonZero(result, HitResult.SmallTickMiss, statistics.SmallTickMiss);
        addIfNonZero(result, HitResult.LargeTickHit, statistics.LargeTickHit);
        addIfNonZero(result, HitResult.LargeTickMiss, statistics.LargeTickMiss);
        addIfNonZero(result, HitResult.SliderTailHit, statistics.SliderTailHit);
        addIfNonZero(result, HitResult.SmallBonus, statistics.SmallBonus);
        addIfNonZero(result, HitResult.LargeBonus, statistics.LargeBonus);
        addIfNonZero(result, HitResult.IgnoreMiss, statistics.IgnoreMiss);
        addIfNonZero(result, HitResult.IgnoreHit, statistics.IgnoreHit);
        addIfNonZero(result, HitResult.ComboBreak, statistics.ComboBreak);
        return result;
    }

    private static void addIfNonZero(
        IDictionary<HitResult, int> result,
        HitResult hitResult,
        int amount
    )
    {
        if (amount > 0)
            result[hitResult] = amount;
    }

    private static Mod[] buildMods(IReadOnlyList<ApiModDto> rawMods, bool isLazer)
    {
        var finalMods = new List<Mod>(rawMods.Count + 1);

        foreach (ApiModDto dto in rawMods)
        {
            var apiMod = new APIMod
            {
                Acronym = dto.Acronym,
                Settings = dto.Settings?.ToDictionary(
                    pair => pair.Key,
                    pair => convertJson(pair.Value)
                ) ?? new Dictionary<string, object>()
            };

            finalMods.Add(apiMod.ToMod(ruleset));
        }

        if (!isLazer && finalMods.All(mod => mod is not ModClassic))
        {
            Mod? classic = ruleset.CreateModFromAcronym("CL");
            if (classic != null)
                finalMods.Add(classic);
        }

        return finalMods.ToArray();
    }

    private static object convertJson(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(
                property => property.Name,
                property => convertJson(property.Value)
            ),
            JsonValueKind.Array => element.EnumerateArray().Select(convertJson).ToArray(),
            JsonValueKind.String => element.GetString() ?? string.Empty,
            JsonValueKind.Number when element.TryGetInt32(out int intValue) => intValue,
            JsonValueKind.Number when element.TryGetInt64(out long longValue) => longValue,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null!,
            _ => element.GetRawText()
        };
    }

    private sealed record CachedBeatmap(
        bool IsLazer,
        FlatWorkingBeatmap WorkingBeatmap,
        Mod[] Mods,
        OsuDifficultyAttributes FullAttributes,
        List<TimedDifficultyAttributes> TimedAttributes
    );

    private sealed record RpcRequest(
        string Id,
        string Method,
        [property: JsonPropertyName("params")] JsonElement Params
    );

    private sealed record RpcResponse(string Id, object? Result, RpcError? Error);

    private sealed record RpcError(string Message);

    private sealed record ApiModDto(
        string Acronym,
        Dictionary<string, JsonElement>? Settings
    );

    private sealed record StatisticsDto(
        int Perfect,
        int Great,
        int Good,
        int Ok,
        int Meh,
        int Miss,
        int SmallTickMiss,
        int SmallTickHit,
        int LargeTickMiss,
        int LargeTickHit,
        int SmallBonus,
        int LargeBonus,
        int IgnoreMiss,
        int IgnoreHit,
        int ComboBreak,
        int SliderTailHit,
        int LegacyComboIncrease
    );

    private sealed record PrepareBeatmapParams(
        string CacheKey,
        string MapPath,
        bool IsLazer,
        List<ApiModDto> Mods
    );

    private sealed record CalculatePerformancesParams(
        string CacheKey,
        List<ScoreRequestDto> Scores
    );

    private sealed record ScoreRequestDto(
        StatisticsDto Statistics,
        double Accuracy,
        int Combo,
        int? PassedObjects
    );

    private sealed record PrepareBeatmapResult(
        double ArConverted,
        double CsConverted,
        double HpConverted,
        double OdConverted,
        double HitWindow,
        int Circles,
        int Sliders,
        int Spinners,
        int MaxCombo,
        double Stars,
        double Aim,
        double Speed,
        double Flashlight,
        double SliderFactor
    );

    private sealed record PerformanceResult(
        double Stars,
        double Pp,
        double PpAccuracy,
        double PpAim,
        double PpFlashlight,
        double PpSpeed
    );
}
